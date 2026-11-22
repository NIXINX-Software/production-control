/*
 * Production Control — intermediate preparation contract test.
 * Run after npm ci: node --test tests/pc-intermediate-preparation.test.cjs
 * This is an isolated API test with a memory-only Firestore stub.
 * No network, Firebase credentials or production writes.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- This Node.js .cjs regression test intentionally uses CommonJS imports. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
/* eslint-enable @typescript-eslint/no-require-imports */

const projectRoot=path.resolve(__dirname,'..');
function loadTypeScript(file,modules){
 const source=fs.readFileSync(path.join(projectRoot,file),'utf8');
 const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const loader=id=>{if(!Object.prototype.hasOwnProperty.call(modules,id))throw Error(`Unexpected import: ${id}`);return modules[id];};
 const fn=vm.runInThisContext(`(function(require,module,exports){${transpiled}\n})`,{filename:file});
 fn(loader,{exports},exports);return exports;
}
const tenant=loadTypeScript('src/lib/pc-tenant.ts',{});
const units=loadTypeScript('src/lib/pc-units.ts',{});
const presentation=loadTypeScript('src/lib/pc-presentation.ts',{});
const collections=new Map();let sequence=0;
function collectionData(name){if(!collections.has(name))collections.set(name,new Map());return collections.get(name);}
function makeDoc(name,id){
 const collection=collectionData(name);
 return {id,
  async get(){const value=collection.get(id);return {id,exists:!!value,data:()=>value?structuredClone(value):undefined,updateTime:{toMillis:()=>1}};},
  async create(value){if(collection.has(id))throw Error('ALREADY_EXISTS');collection.set(id,structuredClone(value));},
  async set(value,{merge}={}){collection.set(id,structuredClone(merge?{...collection.get(id),...value}:value));},
  async update(value){if(!collection.has(id))throw Error('MISSING');collection.set(id,{...collection.get(id),...structuredClone(value)});},
  collection(sub){return {doc:()=>makeDoc(`${name}/${id}/${sub}`,`r${++sequence}`)};}
 };
}
const store={
 collection(name){return {doc(id){return makeDoc(name,id??`r${++sequence}`);},where(field,op,value){return {async get(){return {docs:[...collectionData(name)].filter(([,row])=>row[field]===value).map(([id,row])=>({id,data:()=>structuredClone(row)}))};}}},async get(){return {docs:[...collectionData(name)].map(([id,row])=>({id,data:()=>structuredClone(row)}))};}};},
 async getAll(...refs){return Promise.all(refs.map(r=>r.get()));},
 batch(){const ops=[];return {create(ref,value){ops.push([ref,value]);},async commit(){for(const [ref] of ops){const d=await ref.get();if(d.exists)throw Error('ALREADY_EXISTS');}for(const [ref,value] of ops)await ref.create(value);}};},
 async runTransaction(cb){const changes=[];const tx={get:r=>r.get(),update:(r,v)=>changes.push([r,v]),create:(r,v)=>changes.push([r,v])};await cb(tx);for(const [r,v] of changes){const d=await r.get();if(d.exists)await r.update(v);else await r.create(v);}}
};
const server={
 audit:async()=>{},db:()=>store,findEmployee:async(id)=>({id:String(id),name:'Cocinero de prueba'}),
 newId:()=>`testid_${++sequence}`,operationalToday:()=> '2026-11-04',
 requireSameOrigin:()=>{},requireCorrectionCode:()=>{},requireSuperAdmin:async()=>{},
 safeSite:x=>x==='htl',stamp:()=>new Date('2026-11-04T15:00:00Z').toISOString(),
 text:(v,max)=>typeof v==='string'?v.trim().slice(0,max||1000):'',
 validDate:v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),
 validSites:v=>Array.isArray(v)&&v.length>0&&v.every(tenant.isSiteId),
};
const response={json(body,options={}){return {status:options.status??200,body};}};
const route=loadTypeScript('src/app/api/pc/[action]/route.ts',{
 'next/server':{NextResponse:response},'firebase-admin/firestore':{FieldValue:{increment:x=>x,delete:()=>null}},
 '@/lib/pc-units':units,'@/lib/pc-presentation':presentation,
 '@/lib/pc-kpis-server':{buildManagementData:async()=>({})},'@/lib/pc-server':server,
});
async function post(action,payload){return route.POST({json:async()=>payload},{params:Promise.resolve({action})});}
const common={siteId:'htl',kind:'product',siteIds:['htl'],active:true};

test('MARINADO: producible, usable as ingredient, never required in physical counts',async()=>{
 const marinade=await post('catalog',{...common,name:'Marinado',productKind:'finished',countable:false,bagSize:1,bagUnit:'l',targetDays:10,minDays:3,preparationProcess:'Mezclar agua, ajo y especias'});
 assert.equal(marinade.status,200);const marinadeId=marinade.body.id;
 assert.equal(collectionData('pc_products').get(marinadeId).countable,false);
 // Legacy finished products without the flag must remain countable.
 await makeDoc('pc_products','carnitas').set({name:'Carnitas',kind:'finished',active:true,siteIds:['htl'],bagSize:5,bagUnit:'kg',bagWeightKg:5});
 const prep=await post('batch',{siteId:'htl',operationalDate:'2026-11-04',productId:marinadeId,employeeId:'cook'});
 assert.equal(prep.status,200);const marinadeBatch=prep.body.id;
 assert.equal(collectionData('pc_batches').get(marinadeBatch).countableSnapshot,false);
 const done=await post('finish',{batchId:marinadeBatch,employeeId:'cook',outputAmount:3.5});
 assert.equal(done.status,200);
 assert.equal(collectionData('pc_batches').get(marinadeBatch).outputAmount,3.5);
 assert.equal(collectionData('pc_batches').get(marinadeBatch).bagCount,0);
 const carnitasPrep=await post('batch',{siteId:'htl',operationalDate:'2026-11-04',productId:'carnitas',employeeId:'cook'});
 assert.equal(carnitasPrep.status,200);const carnitasBatch=carnitasPrep.body.id;
 const input=await post('input',{batchId:carnitasBatch,employeeId:'cook',ingredientId:marinadeId,quantity:2.5,unit:'l'});
 assert.equal(input.status,200);assert.equal(collectionData('pc_inputs').get(input.body.id).ingredientName,'Marinado');
 const selfInput=await post('input',{batchId:carnitasBatch,employeeId:'cook',ingredientId:'carnitas',quantity:1,unit:'kg'});
 assert.equal(selfInput.status,400);assert.equal(selfInput.body.error,'INVALID_INGREDIENT');
 const rejected=await post('count',{siteId:'htl',operationalDate:'2026-11-04',period:'opening',startedById:'cook',signedById:'cook',lines:[{productId:marinadeId,bagCount:0,openAmount:0}]});
 assert.equal(rejected.status,400);assert.equal(rejected.body.error,'INVALID_PRODUCT');
 const allowed=await post('count',{siteId:'htl',operationalDate:'2026-11-04',period:'opening',startedById:'cook',signedById:'cook',lines:[{productId:'carnitas',bagCount:3,openAmount:1.25}]});
 assert.equal(allowed.status,200);
 const count=collectionData('pc_counts').get('htl_2026-11-04_opening');assert.equal(count.lines.length,1);assert.equal(count.lines[0].productId,'carnitas');
 assert.equal(count.lines[0].totalAmount,16.25);
 const corrected=await post('output-correct',{batchId:marinadeBatch,employeeId:'cook',verificationCode:'testing',reason:'Ajuste por medición real',outputAmount:3.75});
 assert.equal(corrected.status,200);assert.equal(collectionData('pc_batches').get(marinadeBatch).outputAmount,3.75);
 const relabeled=await post('catalog',{...common,id:marinadeId,name:'Marinado',productKind:'finished',countable:true,bagSize:1,bagUnit:'l',targetDays:10,minDays:3,preparationProcess:'Mezclar agua, ajo y especias'});
 assert.equal(relabeled.status,200);assert.equal(collectionData('pc_products').get(marinadeId).countable,true);
 // The historical production remains unchanged when the catalog's count flag changes.
 assert.equal(collectionData('pc_batches').get(marinadeBatch).countableSnapshot,false);
 assert.equal(collectionData('pc_batches').get(marinadeBatch).outputAmount,3.75);
});

test('Export: no-count marinade absent from Existencias but retained in production and inputs',()=>{
 const reports=loadTypeScript('src/lib/pc-operational-report.ts',{'./pc-presentation':presentation});
 const products=[...collectionData('pc_products')].map(([id,row])=>({id,...row}));
 const counts=[...collectionData('pc_counts')].map(([id,row])=>({id,...row}));
 const batches=[...collectionData('pc_batches')].map(([id,row])=>({id,...row}));
 const inputs=[...collectionData('pc_inputs')].map(([id,row])=>({id,...row}));
 const result=reports.buildOperationalReport({products,staff:[],counts,batches,inputs,activities:[],movements:[]},{site:'htl',from:'2026-11-04',to:'2026-11-04',generatedAt:'2026-11-04T15:00:00Z'});
 const stock=result.sheets.find(x=>x.name==='01_Existencias');
 const production=result.sheets.find(x=>x.name==='04_Producción');
 const ingredient=result.sheets.find(x=>x.name==='07_Ingredientes');
 assert(stock&&production&&ingredient);
 assert(stock.rows.some(row=>row[1]==='Carnitas'));
 assert(production.rows.some(row=>row[1]==='Marinado'));
 assert(ingredient.rows.some(row=>row[2]==='Marinado'));
 // Current catalog was deliberately switched back to countable in the prior test.
 // The status is evaluated at report creation; compare a fresh non-countable instance.
 const noCountProducts=products.map(p=>p.name==='Marinado'?{...p,countable:false}:p);
 const noCountReport=reports.buildOperationalReport({products:noCountProducts,staff:[],counts,batches,inputs,activities:[],movements:[]},{site:'htl',from:'2026-11-04',to:'2026-11-04',generatedAt:'2026-11-04T15:00:00Z'});
 assert(!noCountReport.sheets.find(x=>x.name==='01_Existencias').rows.some(row=>row[1]==='Marinado'));
 assert(noCountReport.sheets.find(x=>x.name==='04_Producción').rows.some(row=>row[1]==='Marinado'));
 const dimension=noCountReport.tables.find(x=>x.file==='dim_productos.csv');
 assert.equal(dimension.headers.length,10);
 assert(dimension.rows.every(row=>row[0]===1));
});


test('tenant configuration preserves HTL and supports new companies without source edits',()=>{
 assert.deepEqual(tenant.resolveTenant(undefined,undefined),{id:'htl',name:'Hot Tacos Leamington'});
 assert.deepEqual(tenant.resolveTenant('htw','Hot Tacos Windsor'),{id:'htw',name:'Hot Tacos Windsor'});
 assert.deepEqual(tenant.resolveTenant('new-company','New Company'),{id:'new-company',name:'New Company'});
 assert.throws(()=>tenant.resolveTenant('htw',undefined),/PC_TENANT_NOT_CONFIGURED/);
 assert.throws(()=>tenant.resolveTenant('invalid/id','Test'),/PC_TENANT_NOT_CONFIGURED/);
});
test('catalog write rejects foreign tenant and multi-company assignment',async()=>{
 const foreign=await post('catalog',{...common,siteId:'htw',siteIds:['htw'],name:'Foreign company',productKind:'ingredient',defaultUnit:'kg'});
 assert.equal(foreign.status,400);
 const multiple=await post('catalog',{...common,siteIds:['htl','htw'],name:'Cross-company',productKind:'ingredient',defaultUnit:'kg'});
 assert.equal(multiple.status,400);
});
test('existing shared catalog record retains original metadata on an HTL-only edit',async()=>{
 const id='legacy-shared';
 await makeDoc('pc_products',id).set({name:'Legacy',kind:'ingredient',active:true,siteIds:['htl','htw'],defaultUnit:'kg'});
 const response=await post('catalog',{...common,id,name:'Legacy edited',productKind:'ingredient',defaultUnit:'kg'});
 assert.equal(response.status,200);
 assert.deepEqual(collectionData('pc_products').get(id).siteIds,['htl','htw']);
});
