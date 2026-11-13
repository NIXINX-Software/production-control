/**
 * NIXINX Operations — first internal-process provider contract (candidate).
 * Independent from pc_products, pc_inputs, pc_counts and pc_movements.
 * A company/site owns each fact. Never use a shared product master across sites.
 */
export const OPS_SITES = ['htl','htw','htft'] as const;
export type OpsSite = typeof OPS_SITES[number];
export const isOpsSite = (x:unknown):x is OpsSite => typeof x==='string' && OPS_SITES.some(s=>s===x);
export const OPS_UNITS = ['kg','g','lb','l','ml','unit','portion'] as const;
export type OpsUnit = typeof OPS_UNITS[number];
export const OPS_MEASURE_TYPES = ['mass','volume','count'] as const;
export type OpsMeasure = typeof OPS_MEASURE_TYPES[number];
export function measureOf(unit:OpsUnit):OpsMeasure {
  return unit==='kg'||unit==='g'||unit==='lb'?'mass':unit==='l'||unit==='ml'?'volume':'count';
}
export function normalUnit(unit:OpsUnit):'kg'|'l'|'unit' {
  return measureOf(unit)==='mass'?'kg':measureOf(unit)==='volume'?'l':'unit';
}
export function baseAmount(quantity:number,unit:OpsUnit):number {
  const factor:Record<OpsUnit,number>={kg:1,g:0.001,lb:0.45359237,l:1,ml:0.001,unit:1,portion:1};
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('INVALID_QUANTITY');
  return Math.round(quantity*factor[unit]*1e6)/1e6;
}
export function validMoneyCents(v:unknown,allowZero=false):v is number {
  return typeof v==='number'&&Number.isSafeInteger(v)&&v>= (allowZero?0:1)&&v<=100000000000;
}
export function validDate(v:unknown):v is string {
  return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
    !Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
}
export const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export type OpsSupplier={id:string;siteId:OpsSite;name:string;active:boolean};
export type OpsProduct={id:string;siteId:OpsSite;name:string;unit:'kg'|'l'|'unit';active:boolean};
export type OpsPresentation={id:string;siteId:OpsSite;productId:string;label:string;packCount:number;packUnit:OpsUnit;unitAmount:number;unit:'kg'|'l'|'unit';active:boolean};
export type OpsPurchase={
 id:string;siteId:OpsSite;purchaseDate:string;supplierId:string;supplierName:string;totalCents:number;currency:'CAD';
 paidCents:number;balanceCents:number;dueDate:string|null;goodsStatus:'pending'|'partial'|'received'|'verified'|'discrepancy';
 documentStatus:'missing'|'captured'|'delivered'|'received'|'rejected';bankStatus:'awaiting_payment'|'pending_reconciliation'|'not_applicable';
 receiptCount:number;documentCount:number;receiptDelivered:boolean;receiptAcknowledged:boolean;notes:string;createdAt?:unknown;
};
export type OpsPayment={id:string;siteId:OpsSite;purchaseId:string;amountCents:number;method:'cash'|'debit_card'|'credit_card'|'credit_note'|'card'|'transfer'|'other';reference?:string;reconciliationStatus:'not_applicable'|'pending';paidDate:string};
export type OpsReceipt={id:string;siteId:OpsSite;purchaseId:string;productId:string;productName:string;presentationId:string;presentationLabel:string;packQuantity:number;receivedBaseAmount:number;unit:'kg'|'l'|'unit';createdAt?:unknown};
export type OpsDocument={id:string;siteId:OpsSite;purchaseId:string;storagePath:string;mime:string;size:number;createdAt?:unknown};
export type OpsSnapshot={products:OpsProduct[];suppliers:OpsSupplier[];presentations:OpsPresentation[];purchases:OpsPurchase[];payments:OpsPayment[];receipts:OpsReceipt[];documents:OpsDocument[]};
export const EMPTY_OPS:OpsSnapshot={products:[],suppliers:[],presentations:[],purchases:[],payments:[],receipts:[],documents:[]};
export function purchaseBalances(totalCents:number,amounts:number[]) {
  if(!validMoneyCents(totalCents)||!amounts.every(a=>validMoneyCents(a)))throw new Error('INVALID_AMOUNTS');
  const paidCents=amounts.reduce((sum,x)=>sum+x,0);
  if(paidCents>totalCents)throw new Error('PAYMENT_EXCEEDS_TOTAL');
  return {paidCents,balanceCents:totalCents-paidCents};
}
export function bankStatusForPayments(methods:OpsPayment['method'][]):OpsPurchase['bankStatus']{
  return methods.some(m=>['card','debit_card','credit_card','transfer','other'].includes(m))?'pending_reconciliation':methods.length?'not_applicable':'awaiting_payment';
}
export function purchaseSummary(rows:OpsPurchase[]) {
  return rows.reduce((a,p)=>({
    count:a.count+1,totalCents:a.totalCents+p.totalCents,balanceCents:a.balanceCents+p.balanceCents,
    pendingGoods:a.pendingGoods+(p.goodsStatus==='verified'?0:1),pendingDocuments:a.pendingDocuments+(p.receiptAcknowledged===true?0:1)
  }),{count:0,totalCents:0,balanceCents:0,pendingGoods:0,pendingDocuments:0});
}
