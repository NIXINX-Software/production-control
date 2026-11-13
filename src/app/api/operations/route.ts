import {NextRequest,NextResponse} from 'next/server';
import {getApps,initializeApp,cert} from 'firebase-admin/app';
import {getFirestore,FieldValue,type Firestore} from 'firebase-admin/firestore';
import {db,requireSameOrigin,text} from '@/lib/pc-server';
import {requireWorkspaceAccess,mayUseOpsAction,type WorkspaceRole} from '@/lib/workspace-access';
import {csvExport} from '@/lib/pc-operational-files';
import {
  OPS_UNITS,isOpsSite,measureOf,normalUnit,baseAmount,validMoneyCents,validDate as opsDate,
  isRecord,purchaseBalances,bankStatusForPayments,type OpsSite,type OpsPayment,type OpsSnapshot
} from '@/lib/ops-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const sandboxName='nixinx-operations-sandbox';
const MAX_RESULTS=200;

/** Preview is NOT allowed to use the live Production Control Firestore for Operations. */
function operationsStore():Firestore {
  if(process.env.VERCEL_ENV==='production'){
    if(process.env.OPS_PRODUCTION_ENABLED!=='true')throw new Error('OPS_RELEASE_DISABLED');
    return db();
  }
  if(process.env.OPS_SANDBOX_PROJECT_ID===undefined||!process.env.OPS_SANDBOX_SERVICE_ACCOUNT_KEY)throw new Error('OPS_SANDBOX_NOT_CONFIGURED');
  const config=JSON.parse(process.env.OPS_SANDBOX_SERVICE_ACCOUNT_KEY) as {project_id:string;client_email:string;private_key:string};
  if(config.project_id!==process.env.OPS_SANDBOX_PROJECT_ID)throw new Error('OPS_SANDBOX_PROJECT_MISMATCH');
  const app=getApps().find(a=>a.name===sandboxName)??initializeApp({credential:cert({
    projectId:config.project_id,clientEmail:config.client_email,privateKey:config.private_key.replace(/\\n/g,'\n')
  })},sandboxName);
  return getFirestore(app);
}
async function authorize(request:NextRequest,site:unknown):Promise<{site:OpsSite;actor:string;role:WorkspaceRole}>{
  const identity=await requireWorkspaceAccess(request,site,['admin','ops_buyer','ops_backoffice']);
  return {site:identity.siteId,actor:identity.uid,role:identity.role};
}
const invalid=(v:unknown)=>typeof v!=='string'||v.length<2;
const mapDocs=(s:FirebaseFirestore.QuerySnapshot)=>s.docs.map(d=>({id:d.id,...d.data()}));
const siteRows=(store:Firestore,col:string,site:OpsSite)=>store.collection(col).where('siteId','==',site).limit(MAX_RESULTS).get();
const docId=(site:OpsSite)=>site+'_'+crypto.randomUUID();
function fail(error:unknown){
 const message=error instanceof Error?error.message:'OPS_ERROR';
 const status=message==='ADMIN_AUTH_REQUIRED'?401:message==='SUPERADMIN_REQUIRED'||message==='ADMIN_ROLE_REQUIRED'||message==='OPS_SITE_FORBIDDEN'||message==='WORKSPACE_SITE_FORBIDDEN'||message==='WORKSPACE_FORBIDDEN'||message==='FORBIDDEN'?403:
   message==='CONFLICT'||message==='PAYMENT_EXCEEDS_TOTAL'?409:message.includes('NOT_CONFIGURED')||message==='OPS_RELEASE_DISABLED'?503:400;
 console.error('NIXINX Operations:',message);
 return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:NextRequest){
 try{
  const {site,role}=await authorize(req,req.nextUrl.searchParams.get('site'));
  const view=req.nextUrl.searchParams.get('view');
  if(view && !['access','export','history'].includes(view))throw new Error('INVALID_VIEW');
  if(view==='access')return NextResponse.json({role,siteId:site},{headers:{'Cache-Control':'private,no-store'}});
  const store=operationsStore();
  if(view==='history'){
    const from=req.nextUrl.searchParams.get('from');
    const to=req.nextUrl.searchParams.get('to');
    if(!opsDate(from)||!opsDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)throw new Error('INVALID_DATE_RANGE');
    // Firestore composite index required: ops_purchases(siteId ASC, purchaseDate DESC).
    // Query filters the company and selected dates on the server; no unbounded collection scan.
    const purchases=await store.collection('ops_purchases')
      .where('siteId','==',site).where('purchaseDate','>=',from).where('purchaseDate','<=',to)
      .orderBy('purchaseDate','desc').limit(MAX_RESULTS+1).get();
    const hasMore=purchases.size>MAX_RESULTS;
    const rows=purchases.docs.slice(0,MAX_RESULTS).map(d=>({id:d.id,...d.data()}));
    // Existing payment and receipt summaries remain on the parent purchase.
    // Full statement evidence matching is not implemented: never manufacture reconciled=true.
    return NextResponse.json({siteId:site,from,to,purchases:rows,hasMore,limit:MAX_RESULTS},
      {headers:{'Cache-Control':'private,no-store'}});
  }
  if(view==='export'){
    if(role!=='admin')throw new Error('WORKSPACE_FORBIDDEN');
    // Export never trusts front-end role checks: authorize() rechecks
    // Firebase ID token + superadmin email/role + explicit site grant.
    // Bounded first increment; this is NOT a certified or complete DWH feed.
    const purchases=await siteRows(store,'ops_purchases',site);
    const rows=purchases.docs.map(d=>{
      const p=d.data();
      return [site,d.id,p.purchaseDate??'',p.supplierId??'',p.supplierName??'',
        p.totalCents??'',p.paidCents??'',p.balanceCents??'',p.goodsStatus??'',
        p.documentStatus??'',p.bankStatus??'',p.dueDate??''];
    });
    const body=csvExport(
      ['site_id','purchase_id','purchase_date','supplier_id','supplier_name','total_cents','paid_cents','balance_cents','goods_status','document_status','bank_status','due_date'],
      rows);
    return new NextResponse(body,{headers:{
      'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="operations_${site}_purchases_sample.csv"`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'X-Data-Quality':'NOT_CERTIFIED',
      'X-Records-Limit':String(MAX_RESULTS)
    }});
  }
  const [p,s,pr,pu,pa,r,d]=await Promise.all([
    siteRows(store,'ops_products',site),siteRows(store,'ops_suppliers',site),siteRows(store,'ops_presentations',site),
    siteRows(store,'ops_purchases',site),siteRows(store,'ops_payments',site),siteRows(store,'ops_receipts',site),
    siteRows(store,'ops_documents',site)
  ]);
  const data:OpsSnapshot={products:mapDocs(p) as OpsSnapshot['products'],suppliers:mapDocs(s) as OpsSnapshot['suppliers'],
   presentations:mapDocs(pr) as OpsSnapshot['presentations'],purchases:mapDocs(pu) as OpsSnapshot['purchases'],
   payments:mapDocs(pa) as OpsSnapshot['payments'],receipts:mapDocs(r) as OpsSnapshot['receipts'],documents:mapDocs(d) as OpsSnapshot['documents']};
  return NextResponse.json({data:role==='ops_buyer'?{...data,products:[],presentations:[],receipts:[]}:data,siteId:site,source:'firestore',contractVersion:'ops.purchases.v0.1'}, {headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const body=await req.json() as Record<string,unknown>;
  if(!isRecord(body))throw new Error('INVALID_REQUEST');
  const {site,actor,role}=await authorize(req,body.siteId);
  const action=body.action;
  if(typeof action!=='string'||!mayUseOpsAction(role,action,body.status))throw new Error('WORKSPACE_FORBIDDEN');
  const store=operationsStore();
  const now=FieldValue.serverTimestamp();
  if(action==='supplier.add'){
    const name=text(body.name,120);
    if(invalid(name))throw new Error('INVALID_SUPPLIER');
    const id=docId(site);
    await store.collection('ops_suppliers').doc(id).create({siteId:site,name,active:true,createdAt:now,updatedAt:now});
    return NextResponse.json({ok:true,id});
  }
  if(action==='product.add'){
    const name=text(body.name,120),unit=body.unit;
    if(invalid(name)||!['kg','l','unit'].includes(String(unit)))throw new Error('INVALID_PRODUCT');
    const id=docId(site);
    await store.collection('ops_products').doc(id).create({siteId:site,name,unit,active:true,createdAt:now,updatedAt:now});
    return NextResponse.json({ok:true,id});
  }
  if(action==='presentation.add'){
    const productId=text(body.productId,130),label=text(body.label,100),unit=body.packUnit,packCount=Number(body.packCount);
    if(invalid(label)||!OPS_UNITS.some(u=>u===unit)||!Number.isFinite(packCount)||packCount<=0||packCount>100000)throw new Error('INVALID_PRESENTATION');
    const product=(await store.collection('ops_products').doc(productId).get()).data();
    if(!product||product.siteId!==site||product.active!==true||product.unit!==normalUnit(unit as typeof OPS_UNITS[number])||(!Number.isInteger(packCount)&&measureOf(unit as typeof OPS_UNITS[number])==='count'))throw new Error('INVALID_PRESENTATION');
    const unitAmount=baseAmount(packCount,unit as typeof OPS_UNITS[number]);
    const id=docId(site);
    await store.collection('ops_presentations').doc(id).create({siteId:site,productId,label,packCount,packUnit:unit,unitAmount,unit:product.unit,active:true,createdAt:now,updatedAt:now});
    return NextResponse.json({ok:true,id});
  }
  if(action==='purchase.add'){
    const supplierId=text(body.supplierId,130),totalCents=body.totalCents,date=body.purchaseDate,termsDays=body.termsDays===null||body.termsDays===undefined||body.termsDays===''?null:Number(body.termsDays);
    const payments=Array.isArray(body.initialPayments)?body.initialPayments:[];
    if(!validMoneyCents(totalCents)||!opsDate(date)||(termsDays!==null&&(!Number.isSafeInteger(termsDays)||termsDays<1||termsDays>365))||payments.length>15)throw new Error('INVALID_PURCHASE');
    const supplier=(await store.collection('ops_suppliers').doc(supplierId).get()).data();
    if(!supplier||supplier.siteId!==site||supplier.active!==true)throw new Error('INVALID_SUPPLIER');
    const normalized: {method:OpsPayment['method'];amountCents:number;reference:string}[]=[];
    for(const pay of payments){
      if(!isRecord(pay)||!['cash','debit_card','credit_card','credit_note','card','transfer','other'].includes(String(pay.method))||!validMoneyCents(pay.amountCents))throw new Error('INVALID_PAYMENTS');
      normalized.push({method:pay.method as OpsPayment['method'],amountCents:pay.amountCents,reference:text(pay.reference,100)});
    }
    const {paidCents,balanceCents}=purchaseBalances(totalCents,normalized.map(p=>p.amountCents));
    const dueDate=balanceCents>0&&termsDays!==null?new Date(Date.parse(date+'T12:00:00Z')+termsDays*86400000).toISOString().slice(0,10):null;
    const id=docId(site),purchaseRef=store.collection('ops_purchases').doc(id),batch=store.batch();
    batch.create(purchaseRef,{siteId:site,purchaseDate:date,supplierId,supplierName:supplier.name,totalCents,
      currency:'CAD',paidCents,balanceCents,dueDate,goodsStatus:'pending',documentStatus:'missing',
      bankStatus:bankStatusForPayments(normalized.map(p=>p.method)),receiptCount:0,documentCount:0,receiptDelivered:false,receiptAcknowledged:false,notes:text(body.notes,600),
      createdBy:actor,createdAt:now,updatedAt:now,contractVersion:'ops.purchases.v0.1'});
    for(const pay of normalized){
      const paymentRef=store.collection('ops_payments').doc(docId(site));
      batch.create(paymentRef,{siteId:site,purchaseId:id,amountCents:pay.amountCents,method:pay.method,reference:pay.reference,
        reconciliationStatus:['cash','credit_note'].includes(pay.method)?'not_applicable':'pending',paidDate:date,createdBy:actor,createdAt:now});
    }
    batch.create(store.collection('ops_audit').doc(docId(site)),{siteId:site,purchaseId:id,action:'purchase.created',actor,createdAt:now});
    await batch.commit();
    return NextResponse.json({ok:true,id});
  }
  if(action==='payment.add'){
    const id=text(body.purchaseId,130),amount=body.amountCents,method=body.method,date=body.paidDate;
    if(!validMoneyCents(amount)||!opsDate(date)||!['cash','debit_card','credit_card','credit_note','card','transfer','other'].includes(String(method)))throw new Error('INVALID_PAYMENT');
    const ref=store.collection('ops_purchases').doc(id),payment=store.collection('ops_payments').doc(docId(site));
    await store.runTransaction(async tx=>{
      const snapshot=await tx.get(ref),p=snapshot.data();
      if(!p||p.siteId!==site||p.cancelled===true)throw new Error('INVALID_PURCHASE');
      if(amount>p.balanceCents)throw new Error('PAYMENT_EXCEEDS_TOTAL');
      tx.create(payment,{siteId:site,purchaseId:id,amountCents:amount,method,reference:text(body.reference,100),reconciliationStatus:['cash','credit_note'].includes(String(method))?'not_applicable':'pending',paidDate:date,createdAt:now,createdBy:actor});
      tx.update(ref,{paidCents:p.paidCents+amount,balanceCents:p.balanceCents-amount,bankStatus:['cash','credit_note'].includes(String(method))?(p.bankStatus==='awaiting_payment'?'not_applicable':p.bankStatus):'pending_reconciliation',updatedAt:now});
      tx.create(store.collection('ops_audit').doc(docId(site)),{siteId:site,purchaseId:id,action:'payment.registered',amountCents:amount,method,actor,createdAt:now});
    });
    return NextResponse.json({ok:true,id:payment.id});
  }
  if(action==='goods.verify'){
    const id=text(body.purchaseId,130),verifier=text(body.verifier,120);
    if(verifier.length<2)throw new Error('VERIFIER_REQUIRED');
    const ref=store.collection('ops_purchases').doc(id);
    await store.runTransaction(async tx=>{
      const snapshot=await tx.get(ref),purchase=snapshot.data();
      if(!purchase||purchase.siteId!==site||purchase.goodsStatus!=='received'||purchase.receiptCount<1)throw new Error('GOODS_NOT_READY_FOR_VERIFICATION');
      tx.update(ref,{goodsStatus:'verified',goodsVerifiedBy:verifier,goodsVerifiedAt:now,updatedAt:now});
      tx.create(store.collection('ops_audit').doc(docId(site)),{siteId:site,purchaseId:id,action:'goods.verified',verifier,actor,createdAt:now});
    });
    return NextResponse.json({ok:true});
  }
  if(action==='document.status'){
    const id=text(body.purchaseId,130),status=body.status,recipient=text(body.recipient,120)||actor;
    if(!['delivered','received','rejected'].includes(String(status)))throw new Error('INVALID_HANDOFF');
    const ref=store.collection('ops_purchases').doc(id);
    await store.runTransaction(async tx=>{
      const doc=await tx.get(ref),p=doc.data();
      if(!p||p.siteId!==site||!['captured','delivered','received','rejected'].includes(p.documentStatus))throw new Error('INVALID_DOCUMENT_STATE');
      if((status==='received'||status==='rejected')&&p.documentStatus!=='delivered'||status==='delivered'&&!['captured','rejected'].includes(p.documentStatus))throw new Error('INVALID_DOCUMENT_STATE');
      tx.update(ref,{documentStatus:status,receiptDelivered:status==='delivered'||status==='received',receiptAcknowledged:status==='received',updatedAt:now});
      tx.create(store.collection('ops_audit').doc(docId(site)),{siteId:site,purchaseId:id,action:'document.'+status,recipient,actor,createdAt:now});
    });
    return NextResponse.json({ok:true});
  }
  if(action==='receipt.add'){
    const purchaseId=text(body.purchaseId,130),presentationId=text(body.presentationId,130),
      packQuantity=Number(body.packQuantity),state=body.goodsStatus,lineTotalCents=body.lineTotalCents;
    if(!Number.isFinite(packQuantity)||packQuantity<=0||packQuantity>100000||!['partial','received'].includes(String(state))||(lineTotalCents!==null&&lineTotalCents!==undefined&&!validMoneyCents(lineTotalCents,true)))throw new Error('INVALID_RECEIPT');
    const presentation=(await store.collection('ops_presentations').doc(presentationId).get()).data();
    if(!presentation||presentation.siteId!==site||presentation.active!==true)throw new Error('INVALID_PRESENTATION');
    const product=(await store.collection('ops_products').doc(presentation.productId).get()).data();
    if(!product||product.siteId!==site||product.active!==true)throw new Error('INVALID_PRODUCT');
    const purchaseRef=store.collection('ops_purchases').doc(purchaseId);
    const receiptRef=store.collection('ops_receipts').doc(docId(site));
    await store.runTransaction(async tx=>{
      const purchase=(await tx.get(purchaseRef)).data();
      if(!purchase||purchase.siteId!==site)throw new Error('INVALID_PURCHASE');
      tx.create(receiptRef,{siteId:site,purchaseId,productId:presentation.productId,productName:product.name,presentationId,
        presentationLabel:presentation.label,packQuantity,receivedBaseAmount:Math.round(packQuantity*presentation.unitAmount*1e6)/1e6,
        unit:presentation.unit,lineTotalCents:lineTotalCents??null,createdBy:actor,createdAt:now});
      tx.update(purchaseRef,{goodsStatus:state,receiptCount:FieldValue.increment(1),updatedAt:now});
      tx.create(store.collection('ops_audit').doc(docId(site)),{siteId:site,purchaseId,action:'receipt.added',receiptId:receiptRef.id,actor,createdAt:now});
    });
    return NextResponse.json({ok:true,id:receiptRef.id});
  }
  throw new Error('INVALID_ACTION');
 }catch(e){return fail(e);}
}
