/* Multi-tenant routing: pure tests, zero Firebase/network/secret access. */
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
 const wrapper=vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file});
 wrapper(id=>{if(!(id in dependencies))throw Error('Unexpected dependency '+id);return dependencies[id];},{exports},exports);
 return exports;
}
const domain=load('src/lib/tenant-domain.ts');
const connection=load('src/lib/tenant-connection.ts',{'./tenant-domain':domain});
test('100 clients, same product host suffix and same application code',()=>{
 for(let i=0;i<100;i++){
  const tenant='company-'+i;
  const parsed=domain.parseTenantDomain(tenant+'.inventory-control.nixinx.app','inventory-control');
  assert.equal(parsed.tenantSlug,tenant);
  assert.equal(parsed.appSlug,'inventory-control');
 }
});
test('reject different app, root hostname, malicious hosts, and user-controlled switches',()=>{
 for(const host of ['inventory-control.nixinx.app','company.other.nixinx.app','company.inventory-control.nixinx.site','company.inventory-control.nixinx.app.evil.test','company.inventory-control.nixinx.app:443','www.inventory-control.nixinx.app','company.inventory-control.nixinx.app/path','company..inventory-control.nixinx.app','localhost','COMPANY.inventory-control.nixinx.app']){
  assert.throws(()=>domain.parseTenantDomain(host,'inventory-control'),/TENANT_DOMAIN_INVALID/);
 }
});
test('unknown or mismatched registry record cannot access another client',()=>{
 const h='htl.inventory-control.nixinx.app';
 const valid={hostname:h,companySlug:'htl',tenantId:'client_HotTacosLeamington',appId:'inventory-control',enabled:true};
 assert.deepEqual(domain.selectTenantByHost(h,'inventory-control',()=>valid),{hostname:h,tenantId:'client_HotTacosLeamington',appId:'inventory-control'});
 for(const r of [null,{...valid,enabled:false},{...valid,companySlug:'htw'},{...valid,hostname:'htw.inventory-control.nixinx.app'},{...valid,appId:'supply'}]){
  assert.throws(()=>domain.selectTenantByHost(h,'inventory-control',()=>r),/TENANT_NOT_AUTHORIZED/);
 }
});
test('per-client Firebase client and server identities must match registry',()=>{
 const h='htw.inventory-control.nixinx.app';
 const valid={hostname:h,companySlug:'htw',tenantId:'client_HotTacosWindsor',appId:'inventory-control',firebaseProjectId:'htw-firebase',
  enabled:true,client:{apiKey:'test',authDomain:'htw.firebaseapp.com',projectId:'htw-firebase',appId:'app-htw'},
  serverCredentialSecretRef:'control/htw/firebase-admin'};
 const checked=connection.validateTenantConnection(h,'inventory-control',valid);
 assert.equal(connection.verifyCredentialProject(checked,{project_id:'htw-firebase',client_email:'service@test',private_key:'test'}),true);
 assert.throws(()=>connection.verifyCredentialProject(checked,{project_id:'htl-firebase',client_email:'service@test',private_key:'test'}),/TENANT_CREDENTIAL_MISMATCH/);
 assert.throws(()=>connection.validateTenantConnection(h,'inventory-control',{...valid,client:{...valid.client,projectId:'htl-firebase'}}),/TENANT_CONNECTION_INVALID/);
 assert.throws(()=>connection.validateTenantConnection(h,'inventory-control',{...valid,enabled:false}),/TENANT_NOT_AUTHORIZED/);
});
