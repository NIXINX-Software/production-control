import 'server-only';
import {db,safeSite} from './pc-server';
import {addDays,buildScenario,deriveDaily,type BatchRecord,type CountRecord,type MovementRecord,type ProductConfig,type ScenarioConfig} from './pc-forecast';

type AnyRow=Record<string,unknown>&{id:string};
const text=(v:unknown)=>typeof v==='string'?v:'';
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
const round=(v:number)=>Math.round(v*1000)/1000;
export type ReportPayload={scenario:ReturnType<typeof buildScenario>;product:ProductConfig;source:{counts:AnyRow[];batches:AnyRow[];inputs:AnyRow[];activities:AnyRow[];movements:AnyRow[]};metrics:{outputKg:number;laborHours:number;kgPerLaborHour:number|null;ingredientEntries:number;completedBatches:number}};
export async function loadReport(config:ScenarioConfig):Promise<ReportPayload>{
 if(!safeSite(config.siteId))throw new Error('INVALID_SITE');
 const store=db();
 const from=[config.historyFrom,config.baseFrom].sort()[0],to=[config.historyTo,config.baseTo].sort().at(-1)!;
 // Date-field range queries avoid scanning the entire history of counts and batches.
 const [products,countsSnap,batchesSnap,movementSnap]=await Promise.all([
  store.collection('pc_products').doc(config.productId).get(),
  store.collection('pc_counts').where('operationalDate','>=',from).where('operationalDate','<=',to).get(),
  store.collection('pc_batches').where('operationalDate','>=',from).where('operationalDate','<=',to).get(),
  store.collection('pc_movements').where('operationalDate','>=',from).where('operationalDate','<=',to).get(),
 ]);
 const pdata=products.data();
 if(!pdata||pdata.kind!=='finished'||pdata.countable===false||!Array.isArray(pdata.siteIds)||!pdata.siteIds.includes(config.siteId))throw new Error('INVALID_PRODUCT');
 const product:ProductConfig={id:products.id,name:String(pdata.name),bagWeightKg:n(pdata.bagWeightKg),targetDays:n(pdata.targetDays)||10,minDays:pdata.minDays===undefined?3:n(pdata.minDays)};
 // Firestore DocumentData is untyped; preserve the row's dynamic fields and an explicit ID.
 const convert=(s:FirebaseFirestore.QuerySnapshot):AnyRow[]=>s.docs.map(d=>({...d.data(),id:d.id} as AnyRow));
 const counts=convert(countsSnap).filter(v=>v.siteId===config.siteId);
 const movements=convert(movementSnap).filter(v=>v.siteId===config.siteId&&v.productId===config.productId);
 const batches=convert(batchesSnap).filter(v=>v.siteId===config.siteId&&v.productId===config.productId);
 const batchIds=new Set(batches.map(b=>b.id));
 // Range queries prevent years of operational inputs/activities being read into memory.
 // Legacy rows without operationalDate require manual one-time backfill if they must appear in these reports.
 const [inputSnap,activitySnap]=await Promise.all([
  store.collection('pc_inputs').where('operationalDate','>=',from).where('operationalDate','<=',to).get(),
  store.collection('pc_activities').where('operationalDate','>=',from).where('operationalDate','<=',to).get(),
 ]);
 const inputs=convert(inputSnap).filter(v=>v.siteId===config.siteId&&batchIds.has(text(v.batchId)));
 const activities=convert(activitySnap).filter(v=>v.siteId===config.siteId&&batchIds.has(text(v.batchId)));
 const historical=deriveDaily(counts as CountRecord[],batches as BatchRecord[],config.siteId,config.productId,movements as MovementRecord[]);
 const inReportingRange=(date:unknown)=>typeof date==='string'&&date>=config.historyFrom&&date<=config.historyTo;
 const reportBatches=batches.filter(v=>inReportingRange(v.operationalDate));
 const completed=reportBatches.filter(v=>v.status==='completed');
 const reportedIds=new Set(reportBatches.map(v=>v.id));
 const reportingActivities=activities.filter(v=>reportedIds.has(text(v.batchId)));
 const reportingInputs=inputs.filter(v=>reportedIds.has(text(v.batchId)));
 let laborHours=0;
 for(const a of reportingActivities){for(const i of Array.isArray(a.intervals)?a.intervals:[]){const it=i as {startedAt?:string;stoppedAt?:string};const start=Date.parse(it.startedAt??'');const end=Date.parse(it.stoppedAt??'');if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)laborHours+=(end-start)/3600000;}}
 const outputKg=round(completed.reduce((s,b)=>s+n(b.outputKg),0));
 const rate=outputKg>0&&laborHours>0?laborHours/outputKg:null;
 // Historical ingredient ratios: keep each native unit separately; never mix grams with kg.
 const stats=new Map<string,{name:string;unit:string;quantity:number}>();
 const completedIds=new Set(completed.map(b=>b.id));
 for(const input of reportingInputs.filter(i=>completedIds.has(text(i.batchId)))){
  const name=text(input.ingredientName),unit=text(input.unit);const key=`${text(input.ingredientId)}:${unit}`;
  const row=stats.get(key)??{name,unit,quantity:0};row.quantity+=n(input.quantity);stats.set(key,row);
 }
 const ratios=outputKg>0?[...stats.values()].map(v=>({...v,quantity:v.quantity/outputKg})):[];
 const scenario=buildScenario(historical,product,config,{laborHoursPerKg:rate,ingredientsPerKg:ratios});
 if(ratios.length)scenario.alerts.push('Ingredientes estimados con base en lotes reales; validar disponibilidad con Cocina y Compras.');
 return {scenario,product,source:{counts,batches:reportBatches,inputs:reportingInputs,activities:reportingActivities,movements:movements.filter(v=>inReportingRange(v.operationalDate))},metrics:{outputKg,laborHours:round(laborHours),kgPerLaborHour:laborHours>0?round(outputKg/laborHours):null,ingredientEntries:reportingInputs.length,completedBatches:completed.length}};
}
export function demoReport(config:ScenarioConfig):ReportPayload{
 const product:ProductConfig={id:'protein-01',name:'Proteína P-01 (demostración)',bagWeightKg:5,targetDays:10,minDays:3};
 const counts:CountRecord[]=[];const batches:BatchRecord[]=[];
 let stock=48;
 const first=[config.baseFrom,config.historyFrom].sort()[0];const last=[config.baseTo,config.historyTo].sort().at(-1)!;
 for(let d=first;d<=last;d=addDays(d,1)){
  const opening=stock;const day=new Date(`${d}T12:00:00Z`).getUTCDay();const demand=day===0?4:day===6?6:5;
  let produced=0;if(stock-demand<15){produced=42;batches.push({siteId:config.siteId,productId:config.productId,operationalDate:d,status:'completed',outputKg:42});}
  stock=round(stock+produced-demand);
  const line=(kg:number)=>({productId:config.productId,bagCount:Math.floor(kg/5),openKg:round(kg%5),bagWeightKgSnapshot:5});
  counts.push({siteId:config.siteId,operationalDate:d,period:'opening',lines:[line(opening)]},{siteId:config.siteId,operationalDate:d,period:'closing',lines:[line(stock)]});
 }
 const historical=deriveDaily(counts,batches,config.siteId,config.productId);
 const observed=historical.filter(d=>d.date>=config.historyFrom&&d.date<=config.historyTo);
 const demoOutput=round(observed.reduce((total,d)=>total+d.productionKg,0));
 const demoCount=observed.filter(d=>d.productionKg>0).length;
 return {scenario:buildScenario(historical,product,config,{laborHoursPerKg:.25,ingredientsPerKg:[{name:'Ingrediente A',quantity:1.1,unit:'kg'},{name:'Ingrediente B',quantity:0.03,unit:'kg'}]}),product,source:{counts:[],batches:[],inputs:[],activities:[],movements:[]},metrics:{outputKg:demoOutput,laborHours:round(demoOutput*.25),kgPerLaborHour:demoOutput?4:null,ingredientEntries:demoCount*3,completedBatches:demoCount}};
}
