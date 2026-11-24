import 'server-only';
import {db, operationalToday, safeSite, type Site} from '@/lib/pc-server';
import {lineKg} from '@/lib/pc-weights';
import type {EmployeeKpi, ManagementAlert, ManagementData, ManagementSummary, ProductKpi, SiteKpi, TrendPoint} from '@/lib/pc-management';

import {PC_TENANT} from './pc-tenant';
const SITES:Site[]=[PC_TENANT.id];

type Row=Record<string,unknown>&{id:string};

type Interval={startedAt?:unknown;stoppedAt?:unknown};

function n(value:unknown):number{return typeof value==='number'&&Number.isFinite(value)?value:Number(value)||0;}
function s(value:unknown):string{return typeof value==='string'?value:'';}
function monthOf(value:unknown):string{return typeof value==='string'&&/^\d{4}-\d{2}/.test(value)?value.slice(0,7):'';}
function hoursFromActivity(row:Row,now:number):number{
 const intervals=Array.isArray(row.intervals)?row.intervals as Interval[]:[];
 let ms=0;
 for(const interval of intervals){
  const start=Date.parse(s(interval.startedAt));
  const stop=Date.parse(s(interval.stoppedAt))||now;
  if(Number.isFinite(start)&&Number.isFinite(stop)&&stop>=start)ms+=stop-start;
 }
 return ms/3_600_000;
}
function emptySummary():ManagementSummary{return {completedCountPairs:0,observedCountDays:0,countPairCompletionPct:0,singleCountDays:0,lateEntries:0,signerMismatches:0,countCorrections:0,activeBatches:0,completedBatches:0,bagsProduced:0,outputKg:0,trackedLaborHours:0,runningTimers:0,ingredientEntries:0,estimatedConsumptionKg:0};}
function pct(a:number,b:number):number{return b?Math.round((a/b)*1000)/10:0;}
function round1(v:number):number{return Math.round(v*10)/10;}

function pairStats(counts:Row[],site?:Site){
 const relevant=site?counts.filter(c=>c.siteId===site):counts;
 const grouped=new Map<string,{siteId:Site;date:string;opening?:Row;closing?:Row}>();
 for(const count of relevant){
  if(!safeSite(count.siteId)||typeof count.operationalDate!=='string')continue;
  const key=`${count.siteId}:${count.operationalDate}`;
  const group=grouped.get(key)??{siteId:count.siteId,date:count.operationalDate};
  if(count.period==='opening')group.opening=count;
  if(count.period==='closing')group.closing=count;
  grouped.set(key,group);
 }
 const groups=[...grouped.values()];
 return {groups,completed:groups.filter(g=>g.opening&&g.closing).length,single:groups.filter(g=>Boolean(g.opening)!==Boolean(g.closing)).length};
}

function summaryFor(site:Site|undefined,counts:Row[],batches:Row[],activities:Row[],inputs:Row[],estimatedBySite:Map<Site,number>):ManagementSummary{
 const summary=emptySummary();
 const cs=site?counts.filter(x=>x.siteId===site):counts;
 const bs=site?batches.filter(x=>x.siteId===site):batches;
 const as=site?activities.filter(x=>x.siteId===site):activities;
 const ins=site?inputs.filter(x=>x.siteId===site):inputs;
 const pairs=pairStats(counts,site);
 summary.completedCountPairs=pairs.completed;
 summary.observedCountDays=pairs.groups.length;
 summary.singleCountDays=pairs.single;
 summary.countPairCompletionPct=pct(pairs.completed,pairs.groups.length);
 summary.lateEntries=cs.filter(x=>x.isLateEntry===true).length;
 summary.signerMismatches=cs.filter(x=>x.signerMismatch===true).length;
 summary.countCorrections=cs.reduce((sum,x)=>sum+n(x.correctionCount),0);
 summary.activeBatches=bs.filter(x=>x.status==='active').length;
 summary.completedBatches=bs.filter(x=>x.status==='completed').length;
 summary.bagsProduced=round1(bs.filter(x=>x.status==='completed').reduce((sum,x)=>sum+n(x.equivalentBags??(n(x.bagCount)+n(x.partialKg)/(n(x.bagWeightKgSnapshot)||1))),0));
 summary.outputKg=round1(bs.filter(x=>x.status==='completed').reduce((sum,x)=>sum+n(x.outputKg),0));
 const now=Date.now();
 summary.trackedLaborHours=round1(as.reduce((sum,x)=>sum+hoursFromActivity(x,now),0));
 summary.runningTimers=as.filter(x=>x.running===true).length;
 summary.ingredientEntries=ins.length;
 summary.estimatedConsumptionKg=round1(site?(estimatedBySite.get(site)??0):[...estimatedBySite.values()].reduce((a,b)=>a+b,0));
 return summary;
}

export async function buildManagementData(filter?:{from?:string;to?:string}):Promise<ManagementData>{
 const store=db();
 const [countSnap,batchSnap,activitySnap,inputSnap,moveSnap,productSnap]=await Promise.all([
  (filter?.from||filter?.to?store.collection('pc_counts').where('operationalDate','>=',filter.from??'2000-01-01').where('operationalDate','<=',filter.to??'2100-01-01'):store.collection('pc_counts')).get(),
  (filter?.from||filter?.to?store.collection('pc_batches').where('operationalDate','>=',filter.from??'2000-01-01').where('operationalDate','<=',filter.to??'2100-01-01'):store.collection('pc_batches')).get(),
  (filter?.from&&filter?.to?store.collection('pc_activities').where('operationalDate','>=',filter.from).where('operationalDate','<=',filter.to):store.collection('pc_activities')).get(),
  (filter?.from&&filter?.to?store.collection('pc_inputs').where('operationalDate','>=',filter.from).where('operationalDate','<=',filter.to):store.collection('pc_inputs')).get(),
  (filter?.from||filter?.to?store.collection('pc_movements').where('operationalDate','>=',filter.from??'2000-01-01').where('operationalDate','<=',filter.to??'2100-01-01'):store.collection('pc_movements')).get(),
  store.collection('pc_products').where('kind','==','finished').get(),
 ]);
 const docs=(snap:FirebaseFirestore.QuerySnapshot):Row[]=>snap.docs.map(d=>({...d.data(),id:d.id}));
 const counts=docs(countSnap).filter(x=>safeSite(x.siteId)),batches=docs(batchSnap).filter(x=>safeSite(x.siteId));const batchIds=new Set(batches.map(x=>x.id));const activities=docs(activitySnap).filter(x=>safeSite(x.siteId)&&batchIds.has(s(x.batchId)));const inputs=docs(inputSnap).filter(x=>safeSite(x.siteId)&&batchIds.has(s(x.batchId))); 

 const movesByKey=new Map<string,number>();for(const movement of docs(moveSnap)){if(!safeSite(movement.siteId)||typeof movement.operationalDate!=='string'||typeof movement.productId!=='string')continue;const mk=`${movement.siteId}:${movement.operationalDate}:${movement.productId}`;movesByKey.set(mk,(movesByKey.get(mk)??0)+n(movement.quantityKg));}
 const completedByKey=new Map<string,number>();
 for(const batch of batches){
  if(batch.status!=='completed'||!safeSite(batch.siteId)||!batch.operationalDate||!batch.productId)continue;
  const key=`${batch.siteId}:${batch.operationalDate}:${batch.productId}`;
  completedByKey.set(key,(completedByKey.get(key)??0)+n(batch.outputKg));
 }
 const estimatedBySite=new Map<Site,number>();
 const estimatedByProduct=new Map<string,number>();
 for(const group of pairStats(counts).groups){
  if(!group.opening||!group.closing)continue;
  const openingLines=Array.isArray(group.opening.lines)?group.opening.lines as Array<Record<string,unknown>>:[];
  const closingLines=Array.isArray(group.closing.lines)?group.closing.lines as Array<Record<string,unknown>>:[];
  const ids=new Set([...openingLines.map(x=>s(x.productId)),...closingLines.map(x=>s(x.productId))].filter(Boolean));
  for(const productId of ids){
   const open=openingLines.find(x=>x.productId===productId),close=closingLines.find(x=>x.productId===productId);
   if(!open||!close)continue;
   const openKg=lineKg(open);
   const closeKg=lineKg(close);
   const produced=completedByKey.get(`${group.siteId}:${group.date}:${productId}`)??0;
   const estimate=Math.max(0,openKg+produced-closeKg-(movesByKey.get(`${group.siteId}:${group.date}:${productId}`)??0));
   estimatedBySite.set(group.siteId,(estimatedBySite.get(group.siteId)??0)+estimate);
   estimatedByProduct.set(productId,(estimatedByProduct.get(productId)??0)+estimate);
  }
 }

 const bySite:SiteKpi[]=SITES.map(siteId=>({siteId,siteName:PC_TENANT.name,...summaryFor(siteId,counts,batches,activities,inputs,estimatedBySite)}));

 const employeeMap=new Map<string,EmployeeKpi>();
 const batchSets=new Map<string,Set<string>>();
 const now=Date.now();
 for(const activity of activities){
  const employeeId=s(activity.employeeId);if(!employeeId)continue;
  const row=employeeMap.get(employeeId)??{employeeId,employeeName:s(activity.employeeName)||employeeId,trackedLaborHours:0,batchesTouched:0,ingredientEntries:0,runningTimers:0};
  row.trackedLaborHours+=hoursFromActivity(activity,now);
  if(activity.running===true)row.runningTimers+=1;
  employeeMap.set(employeeId,row);
  const set=batchSets.get(employeeId)??new Set<string>();if(s(activity.batchId))set.add(s(activity.batchId));batchSets.set(employeeId,set);
 }
 for(const input of inputs){
  const employeeId=s(input.employeeId);if(!employeeId)continue;
  const row=employeeMap.get(employeeId)??{employeeId,employeeName:s(input.employeeName)||employeeId,trackedLaborHours:0,batchesTouched:0,ingredientEntries:0,runningTimers:0};
  row.ingredientEntries+=1;employeeMap.set(employeeId,row);
  const set=batchSets.get(employeeId)??new Set<string>();if(s(input.batchId))set.add(s(input.batchId));batchSets.set(employeeId,set);
 }
 const byEmployee=[...employeeMap.values()].map(row=>({...row,trackedLaborHours:round1(row.trackedLaborHours),batchesTouched:batchSets.get(row.employeeId)?.size??0})).sort((a,b)=>b.trackedLaborHours-a.trackedLaborHours);

 const productMap=new Map<string,ProductKpi>();
 const batchProduct=new Map<string,string>();
 for(const batch of batches){
  const productId=s(batch.productId);if(!productId)continue;
  batchProduct.set(batch.id,productId);
  const row=productMap.get(productId)??{productId,productName:s(batch.productName)||productId,completedBatches:0,bagsProduced:0,outputKg:0,trackedLaborHours:0,estimatedConsumptionKg:round1(estimatedByProduct.get(productId)??0)};
  if(batch.status==='completed'){row.completedBatches+=1;row.bagsProduced+=n(batch.equivalentBags??(n(batch.bagCount)+n(batch.partialKg)/(n(batch.bagWeightKgSnapshot)||1)));row.outputKg+=n(batch.outputKg);}productMap.set(productId,row);
 }
 for(const activity of activities){
  const productId=batchProduct.get(s(activity.batchId));if(!productId)continue;
  const row=productMap.get(productId);if(row)row.trackedLaborHours+=hoursFromActivity(activity,now);
 }
 const byProduct=[...productMap.values()].map(row=>({...row,outputKg:round1(row.outputKg),trackedLaborHours:round1(row.trackedLaborHours)})).sort((a,b)=>b.outputKg-a.outputKg);

 const monthKeys=new Set<string>();
 for(const x of counts){const m=monthOf(x.operationalDate);if(m)monthKeys.add(m);}
 for(const x of batches){const m=monthOf(x.operationalDate);if(m)monthKeys.add(m);}
 const months=[...monthKeys].sort().slice(-12);
 const trend:TrendPoint[]=months.map(month=>{
  const monthBatches=batches.filter(x=>monthOf(x.operationalDate)===month);
  const monthActivities=activities.filter(a=>monthBatches.some(b=>b.id===a.batchId));
  const monthCounts=counts.filter(x=>monthOf(x.operationalDate)===month);
  const pairs=pairStats(monthCounts);
  return {month,completedBatches:monthBatches.filter(x=>x.status==='completed').length,outputKg:round1(monthBatches.filter(x=>x.status==='completed').reduce((sum,x)=>sum+n(x.outputKg),0)),trackedLaborHours:round1(monthActivities.reduce((sum,x)=>sum+hoursFromActivity(x,now),0)),completedCountPairs:pairs.completed,singleCountDays:pairs.single};
 });

 const alerts:ManagementAlert[]=[];
 const today=operationalToday();
 for(const activity of activities.filter(x=>x.running===true).slice(0,10)){
  if(!safeSite(activity.siteId))continue;
  alerts.push({kind:'running-timer',severity:'warning',siteId:activity.siteId,title:`Timer activo · ${s(activity.employeeName)||'Personal'}`,detail:`Lote ${s(activity.batchId)}`});
 }
 for(const batch of batches.filter(x=>x.status==='active'&&typeof x.operationalDate==='string'&&x.operationalDate<today).slice(0,10)){
  if(!safeSite(batch.siteId))continue;
  alerts.push({kind:'active-batch',severity:'critical',siteId:batch.siteId,title:`Preparación abierta · ${s(batch.productName)||'Producto'}`,detail:`Fecha operativa ${s(batch.operationalDate)}`});
 }
 for(const group of pairStats(counts).groups.filter(g=>Boolean(g.opening)!==Boolean(g.closing)).slice(0,10)){
  alerts.push({kind:'missing-count-pair',severity:'warning',siteId:group.siteId,title:'Conteo incompleto',detail:`${group.date}: falta ${group.opening?'cierre':'apertura'}`});
 }
 for(const siteId of SITES){const late=counts.filter(x=>x.siteId===siteId&&x.isLateEntry===true).length;if(late)alerts.push({kind:'late-entry',severity:'warning',siteId,title:'Capturas posteriores',detail:`${late} conteo(s) registrados después de la fecha operativa`});}

 return {generatedAt:new Date().toISOString(),productCatalog:docs(productSnap).filter(r=>r.active!==false&&r.countable!==false&&Array.isArray(r.siteIds)&&r.siteIds.includes(PC_TENANT.id)).map(r=>({id:r.id,name:s(r.name)||r.id,siteIds:[PC_TENANT.id]})),summary:summaryFor(undefined,counts,batches,activities,inputs,estimatedBySite),bySite,byEmployee,byProduct,trend,alerts:alerts.slice(0,30)};
}
