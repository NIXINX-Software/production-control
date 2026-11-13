import {NextRequest, NextResponse} from 'next/server';
import {FieldValue} from 'firebase-admin/firestore';
import {isPCUnit} from '@/lib/pc-units';
import {buildManagementData} from '@/lib/pc-kpis-server';
import {presentation,asKg,isPackUnit,validPartial,productQuantity} from '@/lib/pc-presentation';
import {
  audit,
  db,
  findEmployee,
  newId,
  operationalToday,
  requireSameOrigin,
  requireCorrectionCode,
  requireSuperAdmin,
  safeSite,
  stamp,
  text,
  validDate,
  validSites,
  type Site,
} from '@/lib/pc-server';

export const runtime='nodejs';
type Context={params:Promise<{action:string}>};
type CountLine={productId:string;bagCount:number;openKg?:number;openAmount?:number};
const number=(v:unknown)=>typeof v==='number'?v:Number(v);

function respond(error:unknown){
 const message=error instanceof Error?error.message:'SERVER_ERROR';
 const status=message==='ADMIN_AUTH_REQUIRED'||message==='CORRECTION_AUTH_REQUIRED'?401:message==='SUPERADMIN_REQUIRED'||message==='ADMIN_ROLE_REQUIRED'||message==='FORBIDDEN'?403:message==='CONFLICT'?409:(message.startsWith('Missing server')||message==='CORRECTION_CODE_NOT_CONFIGURED')?503:message==='SERVER_ERROR'?500:400;
 console.error('PC API:',message);
 return NextResponse.json({error:message},{status});
}

type ScopedRow = Record<string, unknown> & {id:string};

function scopedDocs(snap:FirebaseFirestore.QuerySnapshot,siteId:Site|null,kind:'siteId'|'siteIds'):ScopedRow[]{
 const rows:ScopedRow[]=snap.docs.map(d=>({...(d.data() as Record<string, unknown>),id:d.id}));
 if(!siteId)return rows;
 return rows.filter(row=>kind==='siteId'?row.siteId===siteId:Array.isArray(row.siteIds)&&row.siteIds.includes(siteId));
}

/** Period filters are applied by Firestore BEFORE documents are retrieved. */
export async function GET(req:NextRequest,context:Context){try{
 const {action}=await context.params;
 if(action==='management'){
  await requireSuperAdmin(req);
  const from=req.nextUrl.searchParams.get('from')??undefined,to=req.nextUrl.searchParams.get('to')??undefined;
  if(!from||!to||!validDate(from)||!validDate(to)||from>to||Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>90*86400000)throw new Error('INVALID_DATES');
  return NextResponse.json(await buildManagementData({from,to}),{headers:{'Cache-Control':'no-store'}});
 }
 if(action!=='snapshot')throw new Error('NOT_FOUND');
 const p=req.nextUrl.searchParams;
 const site=p.get('site');
 const to=p.get('to')??operationalToday();
 const from=p.get('from')??new Date(Date.parse(to+'T12:00:00Z')-13*86400000).toISOString().slice(0,10);
 if(!safeSite(site)||!validDate(from)||!validDate(to)||from>to||Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>90*86400000)throw new Error('INVALID_HISTORY_PERIOD');
 const store=db();
 const between=(collection:string)=>store.collection(collection).where('operationalDate','>=',from).where('operationalDate','<=',to).get();
 const [pr,pe,co,ba,ac,inp,mov,openBatches]=await Promise.all([
  store.collection('pc_products').get(),store.collection('pc_staff').get(),
  between('pc_counts'),between('pc_batches'),between('pc_activities'),between('pc_inputs'),between('pc_movements'),
  store.collection('pc_batches').where('status','==','active').get(),
 ]);
 const products=scopedDocs(pr,site,'siteIds'),staff=scopedDocs(pe,site,'siteIds');
 const counts=scopedDocs(co,site,'siteId').sort((a,b)=>String(b.operationalDate).localeCompare(String(a.operationalDate)));
 const batches=scopedDocs(ba,site,'siteId');
 const already=new Set(batches.map(b=>b.id));
 const pending=scopedDocs(openBatches,site,'siteId').filter(b=>!already.has(b.id)).slice(0,60);
 batches.push(...pending);
 batches.sort((a,b)=>String(b.operationalDate).localeCompare(String(a.operationalDate)));
 const activities=scopedDocs(ac,site,'siteId'),inputs=scopedDocs(inp,site,'siteId');
 const foundA=new Set(activities.map(a=>a.id)),foundI=new Set(inputs.map(i=>i.id));
 // Only fetch detail for open batches outside the selected period (never all historical activities).
 for(const b of pending){
  const [a,i]=await Promise.all([store.collection('pc_activities').where('batchId','==',b.id).get(),store.collection('pc_inputs').where('batchId','==',b.id).get()]);
  for(const row of scopedDocs(a,site,'siteId'))if(!foundA.has(row.id)){activities.push(row);foundA.add(row.id);}
  for(const row of scopedDocs(i,site,'siteId'))if(!foundI.has(row.id)){inputs.push(row);foundI.add(row.id);}
 }
 const movements=scopedDocs(mov,site,'siteId');
 return NextResponse.json({products,staff,counts,batches,activities,inputs,movements,period:{from,to,site}}, {headers:{'Cache-Control':'no-store'}});
}catch(e){return respond(e);}}

export async function POST(req:NextRequest,context:Context){try{
 const {action}=await context.params;
  requireSameOrigin(req);
 const payload=await req.json() as Record<string,unknown>;
 const store=db();
 if(action==='catalog'){
  const kind=payload.kind, name=text(payload.name), sites=payload.siteIds;
  if(name.length<2||!validSites(sites))throw new Error('INVALID_CATALOG');
  const active=payload.active!==false;
  const branch=payload.siteId;
  if(!safeSite(branch)||!sites.includes(branch))throw new Error('INVALID_SITE');
  const existingId=typeof payload.id==='string'&&/^[\w-]{5,80}$/.test(payload.id)?payload.id:null;
  if(!existingId){if(sites.length!==1||sites[0]!==branch)throw new Error('INVALID_SITE');}
  else {
   const collection=kind==='staff'?'pc_staff':'pc_products';
   const prior=await store.collection(collection).doc(existingId).get();
   const old=prior.data();
   if(!old||!validSites(old.siteIds)||!old.siteIds.includes(branch))throw new Error('FORBIDDEN');
   if(sites.length!==old.siteIds.length||!sites.every(s=>old.siteIds.includes(s)))throw new Error('INVALID_SITE');
  }
  if(kind==='staff'){
   const id=typeof payload.id==='string'&&/^[\w-]{5,80}$/.test(payload.id)?payload.id:newId();
   await store.collection('pc_staff').doc(id).set({name,siteIds:sites,active,updatedAt:stamp()},{merge:true});
   return NextResponse.json({ok:true,id});
  }
  if(kind==='product'){
   const productKind=payload.productKind;
   const size=number(payload.bagSize??payload.bagWeightKg);
   const bagUnit=payload.bagUnit??'kg';
   const weight=isPackUnit(bagUnit)?asKg(size,bagUnit):null;
   const defaultUnit=productKind==='ingredient'?(payload.defaultUnit??'kg'):null;
   if(productKind==='ingredient'&&!isPCUnit(defaultUnit))throw new Error('INVALID_UNIT');
   if(!['finished','ingredient'].includes(String(productKind))||(productKind==='finished'&&(!isPackUnit(bagUnit)||!Number.isFinite(size)||size<=0||size>100000)))throw new Error('INVALID_PRODUCT');
   const id=typeof payload.id==='string'&&/^[\w-]{5,80}$/.test(payload.id)?payload.id:newId();
   const process=payload.preparationProcess;
   // Legacy finished products are inventory-counted unless explicitly disabled.
   if(productKind==='finished'&&payload.countable!==undefined&&typeof payload.countable!=='boolean')throw new Error('INVALID_CATALOG');
   const countable=productKind==='finished'?payload.countable!==false:false;
   // Do not ask kitchen staff to configure a primary ingredient or product category.
   // Preserve pre-existing values on edit for historical batch compatibility.
   const previous=existingId?(await store.collection('pc_products').doc(id).get()).data():undefined;
   const targetDays=number(payload.targetDays??10),minDays=number(payload.minDays??3);
   if(productKind==='finished'&&(
      typeof process!=='string'&&process!==undefined||typeof process==='string'&&process.length>12000||
      !Number.isInteger(targetDays)||targetDays<1||targetDays>180||
      !Number.isInteger(minDays)||minDays<0||minDays>=targetDays
   ))throw new Error('INVALID_PLANNING_CONFIG');
   const processVersion=productKind==='finished'?((Number(previous?.processVersion)||0)+(previous?.preparationProcess===process?0:1)):undefined;
   await store.collection('pc_products').doc(id).set({name:productKind==='ingredient'?name.toLocaleUpperCase('es-CA'):name,kind:productKind,category:text(previous?.category,40)||'other',defaultUnit,bagWeightKg:productKind==='finished'?weight:null,bagSize:productKind==='finished'?size:null,bagUnit:productKind==='finished'?bagUnit:null,siteIds:sites,active,countable,
    ...(productKind==='finished'?{targetDays,minDays,preparationProcess:process??'',processVersion,...(existingId?{leadDays:FieldValue.delete(),supplierLeadDays:FieldValue.delete(),wholeUnitRawKg:FieldValue.delete(),expectedYieldPct:FieldValue.delete()}: {})}:{}),updatedAt:stamp()},{merge:true});
   return NextResponse.json({ok:true,id});
  }
  throw new Error('INVALID_KIND');
 }
 if(action==='movement'){
  const site=payload.siteId,date=payload.operationalDate,kind=payload.movementKind,productId=text(payload.productId,80),quantity=number(payload.quantity??payload.quantityKg);
  if(!safeSite(site)||!validDate(date)||date>operationalToday()||!['foodtruck','windsor','catering','waste','adjustment'].includes(String(kind))||!Number.isFinite(quantity)||quantity<=0||quantity>100000)throw new Error('INVALID_MOVEMENT');
  const employee=await findEmployee(payload.employeeId,site);
  const psnap=await store.collection('pc_products').doc(productId).get(),pr=psnap.data();
  if(!pr||pr.kind!=='finished'||pr.countable===false||!validSites(pr.siteIds)||!pr.siteIds.includes(site))throw new Error('INVALID_PRODUCT');
  const pack=presentation(pr);const unit=payload.unit??pack.bagUnit;
  if(!isPackUnit(unit)||unit!==pack.bagUnit)throw new Error('INVALID_UNIT');
  const quantityKg=asKg(quantity,unit);
  const id=newId();
  await store.collection('pc_movements').doc(id).create({siteId:site,operationalDate:date,productId,productName:pr.name,movementKind:kind,quantity,unit,quantityKg,notes:text(payload.notes,250),employeeId:employee.id,employeeName:employee.name,createdAt:stamp(),updatedAt:stamp()});
  await audit('inventory.movement',site,employee,{id,productId,movementKind:kind,quantity,unit});
  return NextResponse.json({ok:true,id});
 }
 if(action==='count'){
  const site=payload.siteId;
  if(!safeSite(site))throw new Error('INVALID_SITE');
  const date=payload.operationalDate, period=payload.period;
  if(!validDate(date)||date>operationalToday()||!['opening','closing'].includes(String(period)))throw new Error('INVALID_COUNT');
  const starter=await findEmployee(payload.startedById,site);
  const signer=await findEmployee(payload.signedById,site);
  const differs=starter.id!==signer.id;
  if(differs&&payload.confirmDifferentSigner!==true)throw new Error('SIGNER_MISMATCH');
  if(!Array.isArray(payload.lines)||payload.lines.length<1||payload.lines.length>100)throw new Error('INVALID_COUNT');
  const rows=payload.lines as CountLine[];
  if(rows.some(row=>!row||typeof row.productId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(row.productId)||!Number.isSafeInteger(row.bagCount)||row.bagCount<0||row.bagCount>100000))throw new Error('INVALID_COUNT');
  if(new Set(rows.map(r=>r.productId)).size!==rows.length)throw new Error('DUPLICATE_LINE');
  // Fetch catalog references in one operation instead of one sequential Firestore read per product.
  const productRefs=rows.map(row=>store.collection('pc_products').doc(row.productId));
  const productDocs=await store.getAll(...productRefs);
  const lines=[];
  for(let index=0;index<rows.length;index++){
   const row=rows[index];
   const doc=productDocs[index];const p=doc.data();
   if(!p||p.kind!=='finished'||p.countable===false||!p.active||!validSites(p.siteIds)||!p.siteIds.includes(site))throw new Error('INVALID_PRODUCT');
   const pack=presentation(p);
   if(!Number.isFinite(pack.bagSize)||pack.bagSize<=0)throw new Error('INVALID_PRODUCT');
   const openAmount=validPartial(row.openAmount??row.openKg,pack.bagSize);
   const totalAmount=productQuantity(row.bagCount,openAmount,pack.bagSize);
   lines.push({productId:doc.id,productName:p.name,bagCount:row.bagCount,openAmount,totalAmount,quantityUnit:pack.bagUnit,bagSizeSnapshot:pack.bagSize,bagUnitSnapshot:pack.bagUnit,
    openKg:asKg(openAmount,pack.bagUnit),totalKg:asKg(totalAmount,pack.bagUnit),bagWeightKgSnapshot:pack.bagWeightKg});
  }
  const id=`${site}_${date}_${period}`;
  // Count and audit are committed atomically: avoid a saved count returning an error
  // because a separate audit write failed afterwards. No client authentication required.
  const countRef=store.collection('pc_counts').doc(id);
  const auditRef=store.collection('pc_audit').doc();
  try{
   const batch=store.batch();
   batch.create(countRef,{siteId:site,operationalDate:date,period,lines,employeeId:starter.id,employeeName:starter.name,startedById:starter.id,startedByName:starter.name,signedById:signer.id,signedByName:signer.name,signerMismatch:differs,isLateEntry:date<operationalToday(),capturedAt:stamp()});
   batch.create(auditRef,{action:'count.create',siteId:site,actorId:signer.id,actorName:signer.name,details:{id,startedById:starter.id,signedById:signer.id},createdAt:stamp()});
   await batch.commit();
  }catch(e){if(e instanceof Error&&/ALREADY_EXISTS|already exists|6 /.test(e.message))throw new Error('CONFLICT');throw e;}
  return NextResponse.json({ok:true,id},{headers:{'Cache-Control':'no-store'}});
 }
 if(action==='count-correct'){
  requireCorrectionCode(payload.verificationCode);
  const id=text(payload.countId,120), reason=text(payload.reason,500);
  if(!id||reason.length<5)throw new Error('REASON_REQUIRED');
  const ref=store.collection('pc_counts').doc(id);
  const before=await ref.get(),existing=before.data();
  if(!existing||!safeSite(existing.siteId)||!Array.isArray(existing.lines))throw new Error('INVALID_COUNT');
  const employee=await findEmployee(payload.employeeId,existing.siteId);
  const rows=payload.lines;
  if(!Array.isArray(rows)||rows.length!==existing.lines.length)throw new Error('INVALID_COUNT');
  const current=existing.lines as Array<{productId:string;productName:string;bagCount:number;openKg?:number|null;openAmount?:number;bagWeightKgSnapshot:number|null;bagSizeSnapshot?:number;bagUnitSnapshot?:string}>;
  const next=current.map(line=>{
   const proposed=rows.find((row:unknown)=>typeof row==='object'&&row!==null&&(row as CountLine).productId===line.productId) as CountLine|undefined;
   if(!proposed||!Number.isSafeInteger(proposed.bagCount)||proposed.bagCount<0||proposed.bagCount>100000)throw new Error('INVALID_COUNT');
   const pack=presentation({bagSize:line.bagSizeSnapshot,bagUnit:line.bagUnitSnapshot,bagWeightKg:line.bagWeightKgSnapshot});
   const amount=validPartial(proposed.openAmount??proposed.openKg,pack.bagSize);
   const totalAmount=productQuantity(proposed.bagCount,amount,pack.bagSize);
   return {...line,bagCount:proposed.bagCount,openAmount:amount,totalAmount,quantityUnit:pack.bagUnit,bagSizeSnapshot:pack.bagSize,bagUnitSnapshot:pack.bagUnit,
    openKg:asKg(amount,pack.bagUnit),totalKg:asKg(totalAmount,pack.bagUnit)};
  });
  if(next.every((line,i)=>line.bagCount===current[i].bagCount&&line.openAmount===(current[i].openAmount??current[i].openKg??0)))throw new Error('NO_CHANGES');
  const revision=ref.collection('revisions').doc();
  await store.runTransaction(async tx=>{
   const latest=await tx.get(ref);
   if(!latest.exists||latest.updateTime?.toMillis()!==before.updateTime?.toMillis())throw new Error('CONFLICT');
   tx.create(revision,{before:current,after:next,reason,correctedById:employee.id,correctedByName:employee.name,createdAt:stamp()});
   tx.update(ref,{lines:next,updatedAt:stamp(),correctedAt:stamp(),correctedById:employee.id,correctedByName:employee.name,correctionCount:FieldValue.increment(1)});
  });
  await audit('count.correct',existing.siteId,employee,{countId:id,revisionId:revision.id,reason});
  return NextResponse.json({ok:true});
 }
 if(action==='input-correct'){
  requireCorrectionCode(payload.verificationCode);
  const id=text(payload.inputId,100),reason=text(payload.reason,500);
  const qty=number(payload.quantity),unit=payload.unit;
  if(!id||reason.length<5||!Number.isFinite(qty)||qty<=0||qty>100000||!isPCUnit(unit))throw new Error('INVALID_CORRECTION');
  const ref=store.collection('pc_inputs').doc(id),before=await ref.get(),old=before.data();
  if(!old||!safeSite(old.siteId))throw new Error('INVALID_INPUT');
  const employee=await findEmployee(payload.employeeId,old.siteId);
  if(old.quantity===qty&&old.unit===unit)throw new Error('NO_CHANGES');
  const revision=ref.collection('revisions').doc();
  await store.runTransaction(async tx=>{
   const latest=await tx.get(ref);
   if(!latest.exists||latest.updateTime?.toMillis()!==before.updateTime?.toMillis())throw new Error('CONFLICT');
   tx.create(revision,{before:{quantity:old.quantity,unit:old.unit},after:{quantity:qty,unit},reason,correctedById:employee.id,correctedByName:employee.name,createdAt:stamp()});
   tx.update(ref,{quantity:qty,unit,updatedAt:stamp(),correctedAt:stamp(),correctedById:employee.id,correctedByName:employee.name,correctionCount:FieldValue.increment(1)});
  });
  await audit('input.correct',old.siteId,employee,{inputId:id,batchId:old.batchId,revisionId:revision.id,reason});
  return NextResponse.json({ok:true});
 }
 if(action==='output-correct'){
  requireCorrectionCode(payload.verificationCode);
  const id=text(payload.batchId,100),reason=text(payload.reason,500);
  if(!id||reason.length<5)throw new Error('INVALID_CORRECTION');
  const ref=store.collection('pc_batches').doc(id),before=await ref.get(),old=before.data();
  if(!old||old.status!=='completed'||!safeSite(old.siteId))throw new Error('INVALID_BATCH');
  const employee=await findEmployee(payload.employeeId,old.siteId);
  const pack=presentation({bagSize:old.bagSizeSnapshot,bagUnit:old.bagUnitSnapshot,bagWeightKg:old.bagWeightKgSnapshot});
  if(pack.bagSize<=0)throw new Error('INVALID_CORRECTION');
  const direct=old.countableSnapshot===false;
  const directAmount=number(payload.outputAmount);
  if(direct&&(!Number.isFinite(directAmount)||directAmount<=0||directAmount>100000||Math.round(directAmount*1000)/1000!==directAmount))throw new Error('INVALID_CORRECTION');
  const bags=direct?0:number(payload.bagCount);
  if(!Number.isSafeInteger(bags)||bags<0||bags>100000)throw new Error('INVALID_CORRECTION');
  const partialAmount=direct?0:validPartial(payload.partialAmount??payload.partialKg,pack.bagSize);
  const outputAmount=direct?directAmount:productQuantity(bags,partialAmount,pack.bagSize),outputKg=asKg(outputAmount,pack.bagUnit),partialKg=asKg(partialAmount,pack.bagUnit);
  if(outputAmount<=0)throw new Error('INVALID_OUTPUT');
  if(outputAmount===(old.outputAmount??old.outputKg)&&bags===old.bagCount)throw new Error('NO_CHANGES');
  const revision=ref.collection('revisions').doc();
  await store.runTransaction(async tx=>{
   const latest=await tx.get(ref);
   if(!latest.exists||latest.updateTime?.toMillis()!==before.updateTime?.toMillis())throw new Error('CONFLICT');
   tx.create(revision,{before:{bagCount:old.bagCount,partialAmount:old.partialAmount??old.partialKg??0,outputAmount:old.outputAmount??old.outputKg},after:{bagCount:bags,partialAmount,outputAmount},reason,correctedById:employee.id,correctedByName:employee.name,createdAt:stamp()});
   tx.update(ref,{bagCount:bags,partialAmount,outputAmount,outputUnit:pack.bagUnit,partialKg,outputKg,equivalentBags:direct?0:outputAmount/pack.bagSize,updatedAt:stamp(),correctedAt:stamp(),correctedById:employee.id,correctedByName:employee.name,correctionCount:FieldValue.increment(1)});
  });
  await audit('output.correct',old.siteId,employee,{batchId:id,revisionId:revision.id,reason});
  return NextResponse.json({ok:true});
 }
 if(action==='batch'){
  const site=payload.siteId;
  if(!safeSite(site))throw new Error('INVALID_SITE');
  const date=payload.operationalDate, productId=text(payload.productId,80);
  if(!validDate(date)||date>operationalToday())throw new Error('INVALID_BATCH');
  const employee=await findEmployee(payload.employeeId,site);
  const product=await store.collection('pc_products').doc(productId).get();const p=product.data();
  if(!p||!p.active||p.kind!=='finished'||!validSites(p.siteIds)||!p.siteIds.includes(site))throw new Error('INVALID_PRODUCT');
  const id=newId();
  await store.collection('pc_batches').doc(id).create({siteId:site,productId,productName:p.name,operationalDate:date,status:'active',countableSnapshot:p.countable!==false,bagSizeSnapshot:presentation(p).bagSize,bagUnitSnapshot:presentation(p).bagUnit,bagWeightKgSnapshot:presentation(p).bagWeightKg,processSnapshot:p.preparationProcess??'',processVersionSnapshot:p.processVersion??1,createdById:employee.id,createdByName:employee.name,createdAt:stamp(),updatedAt:stamp()});
  await audit('batch.create',site,employee,{batchId:id});
  return NextResponse.json({ok:true,id});
 }
  if(action==='timer-correct'){
   requireCorrectionCode(payload.verificationCode);
   const batchId=text(payload.batchId,100),workEmployeeId=text(payload.workEmployeeId,100),reason=text(payload.reason,500);
   if(!batchId||!workEmployeeId||!reason)throw new Error('INVALID_CORRECTION');
   const batch=await store.collection('pc_batches').doc(batchId).get(),value=batch.data();
   if(!value||!safeSite(value.siteId)||!['active','completed'].includes(value.status))throw new Error('INVALID_BATCH');
   const site=value.siteId as Site;
   const worker=await findEmployee(workEmployeeId,site),corrector=await findEmployee(payload.employeeId,site);
   const incoming=payload.intervals,original=payload.originalIntervals;
   if(!Array.isArray(incoming)||incoming.length>100||!Array.isArray(original)||original.length>100)throw new Error('INVALID_TIMER');
   type Interval={startedAt:string;stoppedAt:string|null};
   const now=Date.now();
   const intervals:Interval[]=incoming.map((row:unknown,index:number)=>{
    if(!row||typeof row!=='object')throw new Error('INVALID_TIMER');
    const v=row as Record<string,unknown>;
    const start=typeof v.startedAt==='string'?v.startedAt:'';
    const stop=v.stoppedAt===null?null:typeof v.stoppedAt==='string'?v.stoppedAt:'';
    const startTime=Date.parse(start),stopTime=stop?Date.parse(stop):NaN;
    if(!Number.isFinite(startTime)||new Date(startTime).toISOString()!==start||startTime>now||startTime<=0)throw new Error('INVALID_TIMER');
    if(stop!==null&&(!Number.isFinite(stopTime)||new Date(stopTime).toISOString()!==stop||stopTime<=startTime||stopTime>now))throw new Error('INVALID_TIMER');
    if(stop===null&&(index!==incoming.length-1||value.status!=='active'))throw new Error('INVALID_TIMER');
    return {startedAt:start,stoppedAt:stop};
   });
   for(let i=1;i<intervals.length;i++){
    const prior=intervals[i-1].stoppedAt;
    if(!prior||Date.parse(intervals[i].startedAt)<Date.parse(prior))throw new Error('OVERLAPPING_TIMER');
   }
   const ref=store.collection('pc_activities').doc(`${batchId}_${worker.id}`),revision=ref.collection('revisions').doc();
   await store.runTransaction(async tx=>{
    const current=await tx.get(ref),data=current.data();
    const previous:Array<Interval>=Array.isArray(data?.intervals)?data.intervals:[];
    if(JSON.stringify(previous)!==JSON.stringify(original))throw new Error('CONFLICT');
    // Removing the final interval is a valid correction; an already-empty timer is a no-op.
    if(JSON.stringify(previous)===JSON.stringify(intervals))throw new Error('NO_CHANGES');
    tx.create(revision,{before:previous,after:intervals,reason,correctedById:corrector.id,correctedByName:corrector.name,createdAt:stamp()});
    tx.set(ref,{batchId,siteId:site,operationalDate:value.operationalDate,employeeId:worker.id,employeeName:worker.name,intervals,running:intervals.at(-1)?.stoppedAt===null,updatedAt:stamp(),correctedAt:stamp(),correctedById:corrector.id,correctedByName:corrector.name,correctionCount:FieldValue.increment(1)},{merge:true});
   });
   await audit('timer.correct',site,corrector,{batchId,workEmployeeId:worker.id,revisionId:revision.id,reason});
   return NextResponse.json({ok:true});
  }
 if(['start','pause','input','finish'].includes(action)){
  const batchId=text(payload.batchId,80),ref=store.collection('pc_batches').doc(batchId);
  const snap=await ref.get(),b=snap.data();
  if(!b||b.status!=='active'||!safeSite(b.siteId))throw new Error('INVALID_BATCH');
  const site=b.siteId as Site;
  const employee=await findEmployee(payload.employeeId,site);
  if(action==='start'||action==='pause'){
   const activity=store.collection('pc_activities').doc(`${batchId}_${employee.id}`);
   await store.runTransaction(async tx=>{
    const previous=await tx.get(activity);const value=previous.data();
    const intervals:Array<{startedAt:string;stoppedAt:string|null}>=Array.isArray(value?.intervals)?[...value.intervals]:[];
    if(action==='start'){
     if(value?.running===true)throw new Error('ALREADY_RUNNING');
     intervals.push({startedAt:new Date().toISOString(),stoppedAt:null});
    }else{
     if(value?.running!==true||!intervals.length)throw new Error('NOT_RUNNING');
     intervals[intervals.length-1]={...intervals[intervals.length-1],stoppedAt:new Date().toISOString()};
    }
    tx.set(activity,{batchId,siteId:site,operationalDate:b.operationalDate,employeeId:employee.id,employeeName:employee.name,running:action==='start',intervals,updatedAt:stamp()},{merge:true});
   });
   await audit(`timer.${action}`,site,employee,{batchId});
   return NextResponse.json({ok:true});
  }
  if(action==='input'){
   const ingredientId=text(payload.ingredientId,80),quantity=number(payload.quantity),unit=payload.unit;
   if(!Number.isFinite(quantity)||quantity<=0||quantity>100000||!isPCUnit(unit))throw new Error('INVALID_INPUT');
   const ingredient=await store.collection('pc_products').doc(ingredientId).get(),p=ingredient.data();
   // A produced, non-countable preparation (e.g. MARINADO) may be used in another batch.
   // Do not allow adding the batch's own product as its input.
   if(!p||!(p.kind==='ingredient'||(p.kind==='finished'&&p.countable===false))||ingredientId===b.productId||!p.active||!validSites(p.siteIds)||!p.siteIds.includes(site))throw new Error('INVALID_INGREDIENT');
   const id=newId();await store.collection('pc_inputs').doc(id).create({batchId,siteId:site,operationalDate:b.operationalDate,ingredientId,ingredientName:p.name,quantity,unit,employeeId:employee.id,employeeName:employee.name,createdAt:stamp(),updatedAt:stamp()});
   await audit('batch.input',site,employee,{batchId,id});return NextResponse.json({ok:true,id});
  }
  if(action==='finish'){
   const pack=b.bagSizeSnapshot?presentation({bagSize:b.bagSizeSnapshot,bagUnit:b.bagUnitSnapshot,bagWeightKg:b.bagWeightKgSnapshot}):presentation((await store.collection('pc_products').doc(b.productId).get()).data()??{});
   if(pack.bagSize<=0)throw new Error('INVALID_OUTPUT');
   // Non-countable preparations are registered by direct produced quantity, never bags.
   const direct=b.countableSnapshot===false;
   const directAmount=number(payload.outputAmount);
   if(direct&&(!Number.isFinite(directAmount)||directAmount<=0||directAmount>100000||Math.round(directAmount*1000)/1000!==directAmount))throw new Error('INVALID_OUTPUT');
   const bagCount=direct?0:number(payload.bagCount);
   if(!Number.isSafeInteger(bagCount)||bagCount<0||bagCount>100000)throw new Error('INVALID_OUTPUT');
   const partialAmount=direct?0:validPartial(payload.partialAmount??payload.partialKg,pack.bagSize);
   const outputAmount=direct?directAmount:productQuantity(bagCount,partialAmount,pack.bagSize),outputKg=asKg(outputAmount,pack.bagUnit),partialKg=asKg(partialAmount,pack.bagUnit);
   if(outputAmount<=0)throw new Error('INVALID_OUTPUT');
   const running=await store.collection('pc_activities').where('batchId','==',batchId).get();
   if(running.docs.some(doc=>doc.data().running===true))throw new Error('TIMERS_RUNNING');
   await store.runTransaction(async tx=>{const fresh=await tx.get(ref);if(fresh.data()?.status!=='active')throw new Error('CONFLICT');tx.update(ref,{status:'completed',bagCount,partialKg,partialAmount,outputAmount,outputUnit:pack.bagUnit,bagSizeSnapshot:pack.bagSize,bagUnitSnapshot:pack.bagUnit,bagWeightKgSnapshot:pack.bagWeightKg,outputKg,equivalentBags:direct?0:outputAmount/pack.bagSize,completedById:employee.id,completedByName:employee.name,completedAt:stamp(),updatedAt:stamp()});});
   await audit('batch.finish',site,employee,{batchId,bagCount,partialAmount,outputAmount,outputUnit:pack.bagUnit});return NextResponse.json({ok:true});
  }
 }
 throw new Error('NOT_FOUND');
}catch(e){return respond(e);}}
