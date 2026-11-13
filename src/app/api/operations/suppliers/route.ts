import {NextRequest,NextResponse} from 'next/server';
import {FieldValue} from 'firebase-admin/firestore';
import {db,requireSameOrigin,text} from '@/lib/pc-server';
import {isOpsSite,validDate,validMoneyCents,isRecord} from '@/lib/ops-contract';
import {nextOpsFolio} from '@/lib/ops-folio';
export const runtime='nodejs';export const dynamic='force-dynamic';
const store=()=>{if(process.env.VERCEL_ENV!=='production')throw new Error('OPS_PREVIEW_DISABLED');return db();};
const docId=(site:string)=>site+'_'+crypto.randomUUID();
function fail(e:unknown){const error=e instanceof Error?e.message:'OPS_ERROR';console.error('Supplier ledger:',error);
 return NextResponse.json({error},{status:error==='OPS_PREVIEW_DISABLED'?503:400,headers:{'Cache-Control':'no-store'}});
}
export async function GET(req:NextRequest){
 try{
  const site=req.nextUrl.searchParams.get('site');
  if(!isOpsSite(site))throw new Error('INVALID_SITE');
  const database=store();
  const [suppliers,purchases,payments]=await Promise.all([
   database.collection('ops_suppliers').where('siteId','==',site).limit(1000).get(),
   database.collection('ops_purchases').where('siteId','==',site).limit(5001).get(),
   database.collection('ops_supplier_payments').where('siteId','==',site).limit(5001).get()
  ]);
  if(purchases.size>5000||payments.size>5000)throw new Error('SUPPLIER_LEDGER_PAGINATION_REQUIRED');
  const rows=suppliers.docs.map(s=>{
   const p=purchases.docs.filter(doc=>doc.data().supplierId===s.id&&doc.data().cancelled!==true);
   const paid=payments.docs.filter(doc=>doc.data().supplierId===s.id);
   return {supplierId:s.id,supplierName:s.data().name,balanceCents:p.reduce((a,doc)=>a+Math.max(0,Number(doc.data().balanceCents??0)),0),
    invoices:p.filter(d=>Number(d.data().balanceCents)>0).length,totalPaidToSupplierCents:paid.reduce((a,d)=>a+Number(d.data().amountCents??0),0)};
  });
  return NextResponse.json({rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const body=await req.json() as Record<string,unknown>;
  if(!isRecord(body)||!isOpsSite(body.siteId)||body.action!=='supplier.pay')throw new Error('INVALID_REQUEST');
  const site=body.siteId,supplierId=text(body.supplierId,140),amount=body.amountCents;
  const method=body.method,date=body.paidDate,reference=text(body.reference,160),actor=text(body.actor,120)||'Operación proveedor';
  if(!validMoneyCents(amount)||!validDate(date)||!['cash','debit_card','credit_card','transfer','other'].includes(String(method)))throw new Error('INVALID_SUPPLIER_PAYMENT');
  const database=store();
  const s=(await database.collection('ops_suppliers').doc(supplierId).get()).data();
  if(!s||s.siteId!==site)throw new Error('SUPPLIER_NOT_FOUND');
  const unpaid=await database.collection('ops_purchases').where('siteId','==',site).limit(5001).get();
  if(unpaid.size>5000)throw new Error('LEDGER_PAGINATION_REQUIRED');
  const due=unpaid.docs.filter(x=>{const d=x.data();return d.supplierId===supplierId&&d.cancelled!==true&&d.balanceCents>0;})
     .sort((a,b)=>String(a.data().purchaseDate).localeCompare(String(b.data().purchaseDate))||a.id.localeCompare(b.id));
  const total=due.reduce((v,p)=>v+p.data().balanceCents,0);
  if(amount>total)throw new Error('PAYMENT_EXCEEDS_SUPPLIER_BALANCE');
  if(due.length>150)throw new Error('TOO_MANY_OPEN_INVOICES');
  const folio=await nextOpsFolio(database,site,'ABN');
  const paymentRef=database.collection('ops_supplier_payments').doc(docId(site));
  // Atomic allocation: check all invoice balances in same transaction, no duplicate debt reduction.
  await database.runTransaction(async tx=>{
   const originals=await Promise.all(due.map(p=>tx.get(p.ref)));
   let remaining=amount;
   const allocations:{purchaseId:string;amountCents:number}[]=[];
   for(const snap of originals){
    const p=snap.data();
    if(!p||p.siteId!==site||p.supplierId!==supplierId||p.cancelled===true)throw new Error('INVOICE_CHANGED_RETRY');
    const portion=Math.min(remaining,p.balanceCents);
    if(portion<=0)continue;
    allocations.push({purchaseId:snap.id,amountCents:portion});
    const bank=['cash'].includes(String(method))?p.bankStatus:'pending_reconciliation';
    tx.update(snap.ref,{paidCents:p.paidCents+portion,balanceCents:p.balanceCents-portion,bankStatus:bank,updatedAt:FieldValue.serverTimestamp()});
    const paymentLine=database.collection('ops_payments').doc(docId(site));
    tx.create(paymentLine,{siteId:site,purchaseId:snap.id,supplierPaymentId:paymentRef.id,amountCents:portion,
     method,reference,reconciliationStatus:method==='cash'?'not_applicable':'pending',
     paidDate:date,createdAt:FieldValue.serverTimestamp(),createdBy:actor});
    remaining-=portion;if(remaining===0)break;
   }
   if(remaining!==0)throw new Error('INVOICE_BALANCE_CHANGED_RETRY');
   tx.create(paymentRef,{siteId:site,supplierId,supplierName:s.name,folio,amountCents:amount,method,
     paidDate:date,reference,allocations,createdBy:actor,createdAt:FieldValue.serverTimestamp()});
   tx.create(database.collection('ops_audit').doc(docId(site)),{siteId:site,supplierId,paymentId:paymentRef.id,action:'supplier.payment',actor,amountCents:amount,createdAt:FieldValue.serverTimestamp()});
  });
  return NextResponse.json({ok:true,id:paymentRef.id,folio});
 }catch(e){return fail(e);}
}
