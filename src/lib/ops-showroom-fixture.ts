import type {OpsSnapshot} from './ops-contract';
/** Showcase-only fixture: illustrative values, never a business catalog. Not loaded into operational forms. */
export const SHOWROOM_ONLY:OpsSnapshot={
 products:[
  {id:'htl_feta',siteId:'htl',name:'Ingrediente de muestra A',unit:'kg',active:true},
  {id:'htl_oil',siteId:'htl',name:'Ingrediente de muestra B',unit:'l',active:true},
  {id:'htw_feta',siteId:'htw',name:'Ingrediente de muestra A',unit:'kg',active:true},
 ],
 suppliers:[{id:'htl_supplier_sample_a',siteId:'htl',name:'Proveedor de muestra A',active:true},{id:'htl_supplier_sample_c',siteId:'htl',name:'Proveedor de muestra C',active:true},
  {id:'htw_supplier_sample_b',siteId:'htw',name:'Proveedor de muestra B',active:true}],
 presentations:[
  {id:'htl_feta_750',siteId:'htl',productId:'htl_feta',label:'Bolsa 750 g',packCount:750,packUnit:'g',unitAmount:0.75,unit:'kg',active:true},
  {id:'htl_feta_1',siteId:'htl',productId:'htl_feta',label:'Bolsa 1 kg',packCount:1,packUnit:'kg',unitAmount:1,unit:'kg',active:true},
  {id:'htl_feta_5',siteId:'htl',productId:'htl_feta',label:'Saco 5 kg',packCount:5,packUnit:'kg',unitAmount:5,unit:'kg',active:true},
  {id:'htl_oil_1',siteId:'htl',productId:'htl_oil',label:'Botella 1 L',packCount:1,packUnit:'l',unitAmount:1,unit:'l',active:true},
  {id:'htw_feta_1',siteId:'htw',productId:'htw_feta',label:'Bolsa 1 kg',packCount:1,packUnit:'kg',unitAmount:1,unit:'kg',active:true}
 ],
 purchases:[
  {id:'htl_demo_credit',siteId:'htl',purchaseDate:'2026-11-13',supplierId:'htl_supplier_sample_a',supplierName:'Proveedor de muestra A',totalCents:50000,currency:'CAD',
   paidCents:0,balanceCents:50000,dueDate:'2026-12-13',goodsStatus:'pending',documentStatus:'captured',bankStatus:'awaiting_payment',
   receiptCount:0,documentCount:1,receiptDelivered:false,receiptAcknowledged:false,notes:'Ejemplo: línea de crédito a 30 días'},
  {id:'htw_demo_cash',siteId:'htw',purchaseDate:'2026-11-13',supplierId:'htw_supplier_sample_b',supplierName:'Proveedor de muestra B',totalCents:12950,currency:'CAD',
   paidCents:12950,balanceCents:0,dueDate:null,goodsStatus:'received',documentStatus:'received',bankStatus:'not_applicable',
   receiptCount:1,documentCount:1,receiptDelivered:true,receiptAcknowledged:true,notes:'Ejemplo: compra de contado'}
 ],
 payments:[{id:'htw_demo_pay',siteId:'htw',purchaseId:'htw_demo_cash',amountCents:12950,method:'cash',reconciliationStatus:'not_applicable',paidDate:'2026-11-13'}],
 receipts:[],documents:[{id:'htl_demo_document',siteId:'htl',purchaseId:'htl_demo_credit',storagePath:'demo-only',mime:'image/jpeg',size:100,createdAt:null}]
};

