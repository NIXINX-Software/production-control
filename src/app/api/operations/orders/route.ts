import {NextRequest,NextResponse} from 'next/server';
import {FieldValue} from 'firebase-admin/firestore';
import {db,requireSameOrigin,requireSuperAdmin,text} from '@/lib/pc-server';
import {isOpsSite,OPS_UNITS,normalUnit,baseAmount,validDate,validMoneyCents,isRecord,type OpsSite,type OpsUnit} from '@/lib/ops-contract';
import {OPS_APPROVAL_AREAS,orderEstimate,supplyStatusFor,effectiveBudgetRange,type OpsOrder,type OpsOrderLine,type OpsCostReportRow,type OpsApprovalArea} from '@/lib/ops-order-contract';
import {nextOpsFolio} from '@/lib/ops-folio';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const store=()=>{if(process.env.VERCEL_ENV!=='production')throw new Error('OPS_PREVIEW_DISABLED');return db();};
const id=(site:OpsSite)=>site+'_'+crypto.randomUUID();
const ISO=()=>new Date().toISOString();
function err(e:unknown){
 const message=e instanceof Error?e.message:'OPS_ERROR';
 console.error('Order management:',message);
 const status=/ADMIN_AUTH_REQUIRED/.test(message)?401:/SUPERADMIN_REQUIRED|FORBIDDEN/.test(message)?403:
   /NOT_FOUND/.test(message)?404:/REVISION|INVALID_STATE/.test(message)?409:
   message==='OPS_PREVIEW_DISABLED'?503:400;
 return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
async function recordEvent(site:OpsSite,orderId:string,action:string,by:string,notes=''){
 await store().collection('ops_order_events').doc(id(site)).create({
  siteId:site,orderId,action,by,notes,at:FieldValue.serverTimestamp()
 });
}
async function costReport(site:OpsSite,from:string,to:string){
 if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)throw new Error('INVALID_REPORT_DATES');
 const database=store();
 // Bounded, explicit incomplete-report failure: never quote a misleading average from truncated data.
 const [purchaseDocs,receiptDocs]=await Promise.all([
   database.collection('ops_purchases').where('siteId','==',site).limit(5001).get(),
   database.collection('ops_receipts').where('siteId','==',site).limit(5001).get()
 ]);
 if(purchaseDocs.size>5000||receiptDocs.size>5000)throw new Error('REPORT_TOO_LARGE_NEEDS_PAGINATION');
 const dates=new Map(purchaseDocs.docs.filter(d=>{
  const p=d.data();return p.cancelled!==true&&typeof p.purchaseDate==='string'&&p.purchaseDate>=from&&p.purchaseDate<=to;
 }).map(d=>[d.id,d.data().purchaseDate as string]));
 const groups=new Map<string,{productId:string;productName:string;unit:'kg'|'l'|'unit';quantity:number;amountCents:number;pricedQty:number;lines:number;unpriced:number}>();
 for(const row of receiptDocs.docs){
  const r=row.data();if(!dates.has(String(r.purchaseId)))continue;
  const qty=Number(r.receivedBaseAmount);
  if(!Number.isFinite(qty)||qty<=0)continue;
  const productId=String(r.productId),prior=groups.get(productId)??{
   productId,productName:String(r.productName),unit:r.unit as 'kg'|'l'|'unit',
   quantity:0,amountCents:0,pricedQty:0,lines:0,unpriced:0};
  prior.quantity+=qty;prior.lines++;
  if(typeof r.lineTotalCents==='number'&&Number.isSafeInteger(r.lineTotalCents)){
   prior.amountCents+=r.lineTotalCents;prior.pricedQty+=qty;
  }else prior.unpriced++;
  groups.set(productId,prior);
 }
 const rows=Array.from(groups.values()).map(r=>({
  productId:r.productId,productName:r.productName,unit:r.unit,
  quantity:Math.round(r.quantity*1000000)/1000000,amountCents:r.amountCents,
  avgCostCents:r.unpriced===0&&r.pricedQty>0?Math.round(r.amountCents/r.pricedQty):null,
  lines:r.lines,unpricedLines:r.unpriced
 })).sort((a,b)=>a.productName.localeCompare(b.productName));
 return {rows,from,to,siteId:site,complete:true};
}
function parseLine(value:unknown,siteProducts:Map<string,{name:string;unit:'kg'|'l'|'unit';active:boolean}>,report:Awaited<ReturnType<typeof costReport>>):OpsOrderLine{
 if(!isRecord(value))throw new Error('INVALID_ORDER_LINE');
 const productId=text(value.productId,140),p=siteProducts.get(productId);
 const unit=value.unit as OpsUnit,quantity=Number(value.quantity);
 if(!p||!p.active||!OPS_UNITS.includes(unit)||normalUnit(unit)!==p.unit||
   !Number.isFinite(quantity)||quantity<=0||quantity>100000)throw new Error('INVALID_ORDER_LINE');
 const base=baseAmount(quantity,unit);
 const row=report.rows.find(x=>x.productId===productId);
 const avg=row?.avgCostCents??null;
 const estimated=avg===null?null:Math.round(base*avg);
 return {id:crypto.randomUUID(),productId,productName:p.name,unit,quantity,requestedBaseAmount:base,
  unitCostCents:avg,estimateCents:estimated,suppliedBaseAmount:0,supplyStatus:'pending',requestedCents:validMoneyCents(Number(value.requestedCents))?Number(value.requestedCents):estimated??0,lineApprovals:{},ownerAccepted:false,ownerLineComment:''};
}
export async function GET(req:NextRequest){
 try{
  const site=req.nextUrl.searchParams.get('site');
  if(!isOpsSite(site))throw new Error('INVALID_SITE');
  const view=req.nextUrl.searchParams.get('view');
  if(view==='costs'){
   const result=await costReport(site,req.nextUrl.searchParams.get('from')??'',req.nextUrl.searchParams.get('to')??'');
   return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }
  if(view!=='orders')throw new Error('INVALID_VIEW');
  const snap=await store().collection('ops_orders').where('siteId','==',site).limit(501).get();
  if(snap.size>500)throw new Error('ORDER_LIST_TOO_LARGE');
  const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
   const x=a as OpsOrder,y=b as OpsOrder;return String(y.folio).localeCompare(String(x.folio));
  });
  return NextResponse.json({orders:rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return err(e);}
}
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const body=await req.json() as Record<string,unknown>;
  if(!isRecord(body)||!isOpsSite(body.siteId))throw new Error('INVALID_ORDER_REQUEST');
  const site=body.siteId,action=body.action,actor=text(body.actor,120).trim()||'Responsable no identificado';
  const database=store();
  if(action==='order.create'||action==='order.revise'){
   const from=String(body.from??''),to=String(body.to??'');
   const requiredDate=String(body.requiredDate??'');
   if(!validDate(requiredDate))throw new Error('INVALID_REQUIRED_DATE');
   const list=body.lines;
   if(!Array.isArray(list)||list.length<1||list.length>100)throw new Error('INVALID_ORDER_LINES');
   const [products,report]=await Promise.all([
    database.collection('ops_products').where('siteId','==',site).limit(1000).get(),costReport(site,from,to)
   ]);
   const productMap=new Map(products.docs.map(d=>[d.id,d.data() as {name:string;unit:'kg'|'l'|'unit';active:boolean}]));
   const lines=list.map(x=>parseLine(x,productMap,report));
   if(new Set(lines.map(x=>x.productId)).size!==lines.length)throw new Error('DUPLICATED_ORDER_PRODUCT');
   const requestedBudgetCents=Number(body.requestedBudgetCents);
   const minPercent=Number(body.minPercent),maxPercent=Number(body.maxPercent);
   if(!validMoneyCents(requestedBudgetCents)||!Number.isFinite(minPercent)||!Number.isFinite(maxPercent)||
       minPercent<0||minPercent>100||maxPercent<100||maxPercent>300||minPercent>maxPercent)throw new Error('INVALID_ORDER_BUDGET');
   const subtotal=orderEstimate(lines);
   const requestedLinesTotal=lines.reduce((sum,line)=>sum+(line.requestedCents??0),0);
   if(requestedLinesTotal!==requestedBudgetCents)throw new Error('ORDER_LINE_BUDGET_MISMATCH');
   const limits=effectiveBudgetRange(requestedBudgetCents,minPercent,maxPercent);
   if(action==='order.create'){
    const folio=await nextOpsFolio(database,site,'OC'),ref=database.collection('ops_orders').doc(id(site));
    await ref.create({siteId:site,folio,status:'draft',revision:1,from,to,requiredDate,lines,
     estimatedSubtotalCents:subtotal,requestedBudgetCents,minPercent,maxPercent,...limits,
     approvals:{},createdBy:actor,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    await recordEvent(site,ref.id,'created',actor);
    return NextResponse.json({ok:true,id:ref.id,folio});
   }
   const orderId=text(body.orderId,140),ref=database.collection('ops_orders').doc(orderId);
   await database.runTransaction(async tx=>{
    const existing=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!existing||existing.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(!['draft','returned'].includes(existing.status))throw new Error('INVALID_STATE');
    tx.update(ref,{from,to,requiredDate,lines,estimatedSubtotalCents:subtotal,requestedBudgetCents,
     minPercent,maxPercent,...limits,approvals:{},revision:FieldValue.increment(1),
     status:'draft',ownerComment:'',updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,'revised',actor);
   return NextResponse.json({ok:true});
  }
  const orderId=text(body.orderId,140);
  const ref=database.collection('ops_orders').doc(orderId);
  if(action==='order.line.approval'||action==='order.line.owner'||action==='order.line.comment'){
   const lineId=text(body.lineId,140);
   const role=body.role as OpsApprovalArea;
   if(action==='order.line.approval'&&(!OPS_APPROVAL_AREAS.includes(role)||actor.length<2))throw new Error('INVALID_APPROVAL');
   const ownerIdentity=action==='order.line.owner'?await requireSuperAdmin(req):null;
   const nextAccepted=body.accepted===true;
   const note=text(body.comment,1000);
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(!['draft','returned'].includes(doc.status))throw new Error('INVALID_STATE');
    const target=doc.lines.find(line=>line.id===lineId);
    if(!target)throw new Error('ORDER_LINE_NOT_FOUND');
    if(action==='order.line.owner'&&nextAccepted&&!OPS_APPROVAL_AREAS.every(a=>target.lineApprovals?.[a]?.revision===doc.revision))throw new Error('LINE_APPROVALS_REQUIRED');
    const lines=doc.lines.map(line=>{
     if(line.id!==lineId)return line;
     if(action==='order.line.approval')return {...line,lineApprovals:{...line.lineApprovals,[role]:{name:actor,at:ISO(),revision:doc.revision}},ownerAccepted:false};
     if(action==='order.line.owner')return {...line,ownerAccepted:nextAccepted,ownerLineComment:note};
     return {...line,ownerLineComment:note};
    });
    const fullyApproved=lines.length>0&&lines.every(line=>line.ownerAccepted&&OPS_APPROVAL_AREAS.every(a=>line.lineApprovals?.[a]?.revision===doc.revision));
    tx.update(ref,{lines,status:fullyApproved?'approved':'draft',...(fullyApproved?{ownerApprovedBy:ownerIdentity?.uid??doc.ownerApprovedBy,ownerApprovedAt:FieldValue.serverTimestamp()}:{}),updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,action,ownerIdentity?.uid??actor,lineId+(note?' | '+note:''));
   return NextResponse.json({ok:true});
  }
  if(action==='order.approval'){
   const role=body.role as OpsApprovalArea;
   if(!OPS_APPROVAL_AREAS.includes(role)||actor.length<2)throw new Error('INVALID_APPROVAL');
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(doc.status!=='draft')throw new Error('INVALID_STATE');
    const approvals={...doc.approvals,[role]:{name:actor,at:ISO(),revision:doc.revision}};
    tx.update(ref,{approvals,updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,'approval.'+role,actor);
   return NextResponse.json({ok:true});
  }
  if(action==='order.submit'){
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(doc.status!=='draft')throw new Error('INVALID_STATE');
    if(!OPS_APPROVAL_AREAS.every(role=>doc.approvals[role]?.revision===doc.revision))throw new Error('FOUR_APPROVALS_REQUIRED');
    tx.update(ref,{status:'pending_owner',updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,'submitted',actor);
   return NextResponse.json({ok:true});
  }
  if(action==='order.owner'){
   const identity=await requireSuperAdmin(req);
   const decision=body.decision;
   if(!['approve','return'].includes(String(decision)))throw new Error('INVALID_DECISION');
   const comment=text(body.comment,1000);
   if(decision==='return'&&comment.trim().length<3)throw new Error('OWNER_COMMENT_REQUIRED');
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(doc.status!=='pending_owner')throw new Error('INVALID_STATE');
    tx.update(ref,{status:decision==='approve'?'approved':'returned',ownerComment:comment,
     ...(decision==='approve'?{ownerApprovedBy:identity.uid,ownerApprovedAt:FieldValue.serverTimestamp()}:{approvals:{}}),
     updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,decision==='approve'?'owner.approved':'owner.returned',identity.uid,comment);
   return NextResponse.json({ok:true});
  }
  if(action==='order.supply'){
   const lineId=text(body.lineId,140);
   const suppliedBaseAmount=Number(body.suppliedBaseAmount);
   if(!Number.isFinite(suppliedBaseAmount)||suppliedBaseAmount<0)throw new Error('INVALID_SUPPLIED_QUANTITY');
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(doc.status!=='approved')throw new Error('INVALID_STATE');
    const found=doc.lines.find(x=>x.id===lineId);
    if(!found||suppliedBaseAmount>found.requestedBaseAmount+0.000001)throw new Error('SUPPLY_EXCEEDS_REQUEST');
    const lines=doc.lines.map(line=>line.id===lineId?{
      ...line,suppliedBaseAmount,supplyStatus:supplyStatusFor(line.requestedBaseAmount,suppliedBaseAmount),note:text(body.note,500)
    }:line);
    tx.update(ref,{lines,revision:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,'supply.updated',actor,lineId);
   return NextResponse.json({ok:true});
  }
  if(action==='order.close'){
   const reason=text(body.reason,500).trim();
   if(reason.length<5)throw new Error('CLOSE_REASON_REQUIRED');
   await database.runTransaction(async tx=>{
    const doc=(await tx.get(ref)).data() as OpsOrder|undefined;
    if(!doc||doc.siteId!==site)throw new Error('ORDER_NOT_FOUND');
    if(doc.status!=='approved')throw new Error('INVALID_STATE');
    const complete=doc.lines.every(line=>line.supplyStatus==='complete');
    tx.update(ref,{status:'closed',closeResult:complete?'complete':'with_pending',
     closeReason:reason,closedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   });
   await recordEvent(site,orderId,'closed',actor,reason);
   return NextResponse.json({ok:true});
  }
  throw new Error('INVALID_ACTION');
 }catch(e){return err(e);}
}
