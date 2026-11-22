const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/instance-site.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(env={}){
  const exports={};
  vm.runInNewContext(code,{exports,process:{env}});
  return exports;
}
test('Existing HTL deployment remains scoped to htl without new variables',()=>{
  const c=load();
  assert.equal(c.INSTANCE_SITE_ID,'htl');
  assert.equal(c.isInstanceSite('htl'),true);
  for(const site of ['htw','htft','',null,undefined,['htl']])assert.equal(c.isInstanceSite(site),false);
});
test('Windsor uses its own fixed scope; Leamington is rejected',()=>{
  const c=load({NEXT_PUBLIC_PC_SITE_ID:'htw'});
  assert.equal(c.INSTANCE_SITE_NAME,'Hot Tacos Windsor');
  assert.equal(c.isInstanceSite('htw'),true);
  assert.equal(c.isInstanceSite('htl'),false);
});
test('New client configured without source change; invalid settings fail closed',()=>{
  const c=load({NEXT_PUBLIC_PC_SITE_ID:'new-client',NEXT_PUBLIC_PC_SITE_NAME:'New Client'});
  assert.equal(c.isInstanceSite('new-client'),true);
  assert.equal(c.isInstanceSite('htl'),false);
  assert.throws(()=>load({NEXT_PUBLIC_PC_SITE_ID:''}),/INVALID_INSTANCE_SITE_ID/);
  assert.throws(()=>load({NEXT_PUBLIC_PC_SITE_ID:'../htl'}),/INVALID_INSTANCE_SITE_ID/);
  assert.throws(()=>load({NEXT_PUBLIC_PC_SITE_ID:'unknown'}),/INVALID_INSTANCE_SITE_NAME/);
});
