/* No Firebase network, real secret reads or production access. */
/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
/* eslint-enable @typescript-eslint/no-require-imports */
function load(file,dependencies={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(
  id=>{if(!(id in dependencies))throw Error('Unexpected import '+id);return dependencies[id];},{exports},exports
 );
 return exports;
}
const domain=load('src/lib/tenant-domain.ts');
const connection=load('src/lib/tenant-connection.ts',{'./tenant-domain':domain});
const adminApps=[];
const firebaseApp={
 cert:value=>value,
 getApps:()=>adminApps,
 initializeApp:(opts,name)=>{const app={name,options:{projectId:opts.credential.projectId}};adminApps.push(app);return app;}
};
const admin=load('src/lib/tenant-firebase-admin.ts',{
 'server-only':{},
 'firebase-admin/app':firebaseApp,
 'firebase-admin/auth':{getAuth:app=>({projectId:app.options.projectId})},
 'firebase-admin/firestore':{getFirestore:app=>({projectId:app.options.projectId})},
 './tenant-connection':connection
});
const clientApps=[];
const client=load('src/lib/tenant-firebase-client.ts',{
 'firebase/app':{getApps:()=>clientApps,initializeApp:(cfg,name)=>{const app={name,options:cfg};clientApps.push(app);return app;}},
 'firebase/auth':{getAuth:app=>({projectId:app.options.projectId})}
});
function tenant(slug){
 return connection.validateTenantConnection(slug+'.inventory-control.nixinx.app','inventory-control',{
 hostname:slug+'.inventory-control.nixinx.app',companySlug:slug,tenantId:'tenant_'+slug,appId:'inventory-control',
 firebaseProjectId:slug+'-firebase',client:{apiKey:slug,authDomain:slug+'.firebaseapp.com',projectId:slug+'-firebase',appId:'app-'+slug},
 serverCredentialSecretRef:'nixinx-control/secrets/'+slug,enabled:true
 });
}
const credentials={async readCredential(ref){
 const slug=ref.split('/').at(-1);
 return {project_id:slug+'-firebase',client_email:slug+'@service.test',private_key:'test'};
}};
test('server creates separate named Firebase Admin apps for HTL and HTW',async()=>{
 const htl=tenant('htl'),htw=tenant('htw');
 const a=await admin.getTenantFirebaseAdmin(htl,credentials);
 const b=await admin.getTenantFirebaseAdmin(htw,credentials);
 assert.notEqual(a.app.name,b.app.name);
 assert.equal(a.firestore.projectId,'htl-firebase');
 assert.equal(b.firestore.projectId,'htw-firebase');
 assert.equal(adminApps.length,2);
 const same=await admin.getTenantFirebaseAdmin(htl,credentials);
 assert.equal(same.app,a.app);
 assert.equal(adminApps.length,2);
});
test('server refuses to initialize a Firebase project with another company credentials',async()=>{
 const htw=tenant('htw');
 const evil={readCredential:async()=>({project_id:'htl-firebase',client_email:'htl@service.test',private_key:'test'})};
 const before=adminApps.length;
 await assert.rejects(admin.getTenantFirebaseAdmin(htw,evil),/TENANT_CREDENTIAL_MISMATCH/);
 assert.equal(adminApps.length,before);
});
test('browser instances bind public Firebase settings to resolved tenant project',()=>{
 const htl=tenant('htl'),htw=tenant('htw');
 const a=client.createTenantFirebaseClient(htl,htl.client),b=client.createTenantFirebaseClient(htw,htw.client);
 assert.notEqual(a.app.name,b.app.name);
 assert.equal(a.auth.projectId,'htl-firebase');
 assert.equal(b.auth.projectId,'htw-firebase');
 assert.throws(()=>client.createTenantFirebaseClient(htw,htl.client),/TENANT_FIREBASE_CLIENT_MISMATCH/);
});
