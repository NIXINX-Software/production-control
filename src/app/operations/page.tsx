'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {auth} from '@/lib/firebase';
import {baseAmount,bankStatusForPayments,EMPTY_OPS,normalUnit,purchaseBalances,purchaseSummary,
 type OpsSite,type OpsUnit,type OpsSnapshot,type OpsPurchase,type OpsPayment,type OpsPresentation} from '@/lib/ops-contract';
import './operations.css';

type Panel='compras'|'recepcion'|'catalogos'|'kpis'|'showroom'|'datos';
type ViewMode='demo'|'live';
const SITES:{id:OpsSite;name:string}[]=[{id:'htl',name:'Hot Tacos Leamington'},{id:'htw',name:'Hot Tacos Windsor'},{id:'htft',name:'Hot Tacos Food Truck'}];
const dateToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const cash=(cents:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
const genId=(s:OpsSite)=>s+'_'+crypto.randomUUID();
const uLabel:Record<OpsUnit,string>={kg:'kg',g:'g',lb:'lb',l:'L',ml:'mL',unit:'pzas',portion:'porciones'};
const initial:OpsSnapshot={
 products:[
  {id:'htl_feta',siteId:'htl',name:'Queso feta',unit:'kg',active:true},
  {id:'htl_oil',siteId:'htl',name:'Aceite vegetal',unit:'l',active:true},
  {id:'htw_feta',siteId:'htw',name:'Queso feta',unit:'kg',active:true},
 ],
 suppliers:[{id:'htl_charro',siteId:'htl',name:'El Charro',active:true},{id:'htl_costco',siteId:'htl',name:'Costco',active:true},
  {id:'htw_costco',siteId:'htw',name:'Costco Windsor',active:true}],
 presentations:[
  {id:'htl_feta_750',siteId:'htl',productId:'htl_feta',label:'Bolsa 750 g',packCount:750,packUnit:'g',unitAmount:0.75,unit:'kg',active:true},
  {id:'htl_feta_1',siteId:'htl',productId:'htl_feta',label:'Bolsa 1 kg',packCount:1,packUnit:'kg',unitAmount:1,unit:'kg',active:true},
  {id:'htl_feta_5',siteId:'htl',productId:'htl_feta',label:'Saco 5 kg',packCount:5,packUnit:'kg',unitAmount:5,unit:'kg',active:true},
  {id:'htl_oil_1',siteId:'htl',productId:'htl_oil',label:'Botella 1 L',packCount:1,packUnit:'l',unitAmount:1,unit:'l',active:true},
  {id:'htw_feta_1',siteId:'htw',productId:'htw_feta',label:'Bolsa 1 kg',packCount:1,packUnit:'kg',unitAmount:1,unit:'kg',active:true}
 ],
 purchases:[
  {id:'htl_demo_credit',siteId:'htl',purchaseDate:'2026-11-13',supplierId:'htl_charro',supplierName:'El Charro',totalCents:50000,currency:'CAD',
   paidCents:0,balanceCents:50000,dueDate:'2026-12-13',goodsStatus:'pending',documentStatus:'captured',bankStatus:'awaiting_payment',
   receiptCount:0,documentCount:1,notes:'Ejemplo: línea de crédito a 30 días'},
  {id:'htw_demo_cash',siteId:'htw',purchaseDate:'2026-11-13',supplierId:'htw_costco',supplierName:'Costco Windsor',totalCents:12950,currency:'CAD',
   paidCents:12950,balanceCents:0,dueDate:null,goodsStatus:'received',documentStatus:'received',bankStatus:'not_applicable',
   receiptCount:1,documentCount:1,notes:'Ejemplo: compra de contado'}
 ],
 payments:[{id:'htw_demo_pay',siteId:'htw',purchaseId:'htw_demo_cash',amountCents:12950,method:'cash',reconciliationStatus:'not_applicable',paidDate:'2026-11-13'}],
 receipts:[],documents:[{id:'htl_demo_document',siteId:'htl',purchaseId:'htl_demo_credit',storagePath:'demo-only',mime:'image/jpeg',size:100,createdAt:null}]
};
const tabs:{id:Panel;title:string}[]=[{id:'compras',title:'Compras'},{id:'recepcion',title:'Recepción'},{id:'catalogos',title:'Catálogos'},
 {id:'kpis',title:'KPIs'},{id:'showroom',title:'Showroom'},{id:'datos',title:'Datos / DWH'}];
const filterSite=(data:OpsSnapshot,siteId:OpsSite):OpsSnapshot=>({
 products:data.products.filter(x=>x.siteId===siteId),suppliers:data.suppliers.filter(x=>x.siteId===siteId),
 presentations:data.presentations.filter(x=>x.siteId===siteId),purchases:data.purchases.filter(x=>x.siteId===siteId),
 payments:data.payments.filter(x=>x.siteId===siteId),receipts:data.receipts.filter(x=>x.siteId===siteId),documents:data.documents.filter(x=>x.siteId===siteId)
});
const statusText={
 pending:'Pendiente',partial:'Parcial',received:'Recibido',verified:'Validado',discrepancy:'Con diferencias',
 missing:'Sin comprobante',captured:'Capturado',delivered:'Entregado',rejected:'Rechazado',
 awaiting_payment:'Sin pago bancario',pending_reconciliation:'Por conciliar',not_applicable:'Sin cargo bancario'
} as Record<string,string>;
const status=(v:string)=>statusText[v]||v;
function csvDownload(filename:string,header:string[],rows:(string|number)[][]){
 const safe=(v:string|number)=>'"'+String(v).replace(/"/g,'""')+'"';
 const content='\ufeff'+[header,...rows].map(r=>r.map(safe).join(',')).join('\r\n');
 const obj=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=obj;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(obj),1000);
}
export default function Operations(){
 const [tab,setTab]=useState<Panel>('compras'),[mode,setMode]=useState<ViewMode>('demo'),[site,setSite]=useState<OpsSite>('htl');
 const [scope,setScope]=useState<OpsSite[]>(['htl']),[data,setData]=useState<OpsSnapshot>(initial);
 const [user,setUser]=useState<User|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[selection,setSelection]=useState('htl_demo_credit');
 const [supplierId,setSupplierId]=useState('htl_charro'),[total,setTotal]=useState('500'),[purchaseDate,setPurchaseDate]=useState(dateToday());
 const [terms,setTerms]=useState('30'),[initialPay,setInitialPay]=useState('0'),[initialMethod,setInitialMethod]=useState<OpsPayment['method']>('card'),[notes,setNotes]=useState('');
 const [payAmount,setPayAmount]=useState(''),[payMethod,setPayMethod]=useState<OpsPayment['method']>('transfer');
 const [recipient,setRecipient]=useState(''),[evidence,setEvidence]=useState<File|null>(null);
 const [newSupplier,setNewSupplier]=useState(''),[newProduct,setNewProduct]=useState(''),[productUnit,setProductUnit]=useState<'kg'|'l'|'unit'>('kg');
 const [presentationProduct,setPresentationProduct]=useState('htl_feta'),[newPresentationLabel,setNewPresentationLabel]=useState('');
 const [packCount,setPackCount]=useState('750'),[packUnit,setPackUnit]=useState<OpsUnit>('g');
 const [receivingPresentation,setReceivingPresentation]=useState('htl_feta_750'),[receivedPacks,setReceivedPacks]=useState('3');
 const [receptionState,setReceptionState]=useState<'partial'|'received'>('received');
 useEffect(()=>{if(!auth)return;return onAuthStateChanged(auth,setUser);},[]);
 const active=useMemo(()=>filterSite(data,site),[data,site]);
 const purchases=useMemo(()=>data.purchases.filter(p=>scope.includes(p.siteId)),[data,scope]);
 const stats=useMemo(()=>purchaseSummary(purchases),[purchases]);
 const selected=data.purchases.find(p=>p.id===selection&&p.siteId===site)??active.purchases[0];
 const supplier=active.suppliers.find(x=>x.id===supplierId);
 const presentationProductObj=active.products.find(x=>x.id===presentationProduct);
 const eligibleUnits=(['kg','g','lb','l','ml','unit','portion'] as OpsUnit[]).filter(u=>presentationProductObj&&normalUnit(u)===presentationProductObj.unit);
 const currentPresentation=active.presentations.find(x=>x.id===receivingPresentation);
 const associated=selected?data.payments.filter(p=>p.purchaseId===selected.id):[];
 const setChange=(purchaseId:string,patch:Partial<OpsPurchase>)=>setData(d=>({...d,purchases:d.purchases.map(p=>p.id===purchaseId?{...p,...patch}:p)}));
 async function request(action:string,payload:Record<string,unknown>,siteId:OpsSite=site){
  if(!user)throw new Error('Inicia sesión con una cuenta administrativa autorizada.');
  const token=await user.getIdToken();
  const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({...payload,siteId,action})});
  const result=await response.json() as {ok?:boolean;id?:string;error?:string};
  if(!response.ok)throw new Error(result.error||'No se pudo completar la operación.');
  return result;
 }
 async function refreshLive(nextScope:OpsSite[]=scope){
  if(!user)throw new Error('Inicia sesión para consultar datos autorizados.');
  const token=await user.getIdToken();
  const requests=await Promise.all(nextScope.map(async id=>{
   const resp=await fetch('/api/operations?site='+id,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const result=await resp.json() as {data?:OpsSnapshot;error?:string};
   if(!resp.ok||!result.data)throw new Error(id.toUpperCase()+': '+(result.error||String(resp.status)));
   return result.data;
  }));
  setData({products:requests.flatMap(d=>d.products),suppliers:requests.flatMap(d=>d.suppliers),
    presentations:requests.flatMap(d=>d.presentations),purchases:requests.flatMap(d=>d.purchases),
    payments:requests.flatMap(d=>d.payments),receipts:requests.flatMap(d=>d.receipts),
    documents:requests.flatMap(d=>d.documents)});
 }
 async function work(job:()=>Promise<void>){setBusy(true);setMsg('');try{await job();setMsg('Operación completada.');}
  catch(e){setMsg('No se completó: '+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}}
 function chooseSite(v:OpsSite){setSite(v);setScope([v]);setSelection('');setSupplierId('');setPresentationProduct('');setReceivingPresentation('');}
 async function addSupplier(){
  if(newSupplier.trim().length<2)throw new Error('Escribe el nombre del proveedor.');
  if(mode==='live'){await request('supplier.add',{name:newSupplier});await refreshLive();}
  else {const id=genId(site);setData(d=>({...d,suppliers:[...d.suppliers,{id,siteId:site,name:newSupplier.trim(),active:true}]}));setSupplierId(id);}
  setNewSupplier('');
 }
 async function addProduct(){
  if(newProduct.trim().length<2)throw new Error('Escribe el nombre del producto.');
  if(mode==='live'){await request('product.add',{name:newProduct,unit:productUnit});await refreshLive();}
  else{const id=genId(site);setData(d=>({...d,products:[...d.products,{id,siteId:site,name:newProduct.trim(),unit:productUnit,active:true}]}));setPresentationProduct(id);}
  setNewProduct('');
 }
 async function addPresentation(){
  if(!presentationProductObj)throw new Error('Selecciona el producto maestro.');
  const n=Number(packCount);
  if(!newPresentationLabel.trim()||!Number.isFinite(n)||n<=0||normalUnit(packUnit)!==presentationProductObj.unit)throw new Error('Presentación o unidad inválida.');
  if(mode==='live'){await request('presentation.add',{productId:presentationProductObj.id,label:newPresentationLabel,packCount:n,packUnit});await refreshLive();}
  else{const id=genId(site),p:OpsPresentation={id,siteId:site,productId:presentationProductObj.id,label:newPresentationLabel.trim(),packCount:n,packUnit,unitAmount:baseAmount(n,packUnit),unit:presentationProductObj.unit,active:true};
    setData(d=>({...d,presentations:[...d.presentations,p]}));setReceivingPresentation(id);}
  setNewPresentationLabel('');
 }
 async function addPurchase(){
  const cents=Math.round(Number(total)*100),payCents=Math.round(Number(initialPay||0)*100);
  if(!supplier||!Number.isSafeInteger(cents)||cents<1||!Number.isSafeInteger(payCents)||payCents<0)throw new Error('Selecciona proveedor e importes válidos.');
  const b=purchaseBalances(cents,payCents?[payCents]:[]);
  const days=Number(terms);
  if(!Number.isInteger(days)||days<0||days>365)throw new Error('Plazo de crédito inválido.');
  const payments=payCents?[{amountCents:payCents,method:initialMethod}]:[];
  if(mode==='live'){
   const r=await request('purchase.add',{supplierId:supplier.id,totalCents:cents,purchaseDate,termsDays:days,initialPayments:payments,notes});
   await refreshLive();if(r.id)setSelection(r.id);
  }else{
   const id=genId(site),due=b.balanceCents?new Date(Date.parse(purchaseDate+'T12:00:00Z')+days*86400000).toISOString().slice(0,10):null;
   const row:OpsPurchase={id,siteId:site,purchaseDate,supplierId:supplier.id,supplierName:supplier.name,totalCents:cents,currency:'CAD',
     ...b,dueDate:due,goodsStatus:'pending',documentStatus:'missing',bankStatus:bankStatusForPayments(payments.map(p=>p.method)),
     receiptCount:0,documentCount:0,notes};
   const payment:OpsPayment[]=payCents?[{id:genId(site),siteId:site,purchaseId:id,amountCents:payCents,method:initialMethod,
    reconciliationStatus:initialMethod==='cash'?'not_applicable':'pending',paidDate:purchaseDate}]:[];
   setData(d=>({...d,purchases:[row,...d.purchases],payments:[...d.payments,...payment]}));setSelection(id);
  }
  setNotes('');setInitialPay('0');setTab('compras');
 }
 async function addPayment(){
  if(!selected)throw new Error('Selecciona una compra.');
  const cents=Math.round(Number(payAmount)*100);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>selected.balanceCents)throw new Error('El abono debe ser mayor que cero y no superar la deuda.');
  if(mode==='live'){await request('payment.add',{purchaseId:selected.id,amountCents:cents,method:payMethod,paidDate:dateToday()});await refreshLive();}
  else{
   const row:OpsPayment={id:genId(site),siteId:site,purchaseId:selected.id,amountCents:cents,method:payMethod,
     reconciliationStatus:payMethod==='cash'?'not_applicable':'pending',paidDate:dateToday()};
   setData(d=>({...d,payments:[...d.payments,row]}));
   setChange(selected.id,{paidCents:selected.paidCents+cents,balanceCents:selected.balanceCents-cents,
     bankStatus:payMethod==='cash'?selected.bankStatus:'pending_reconciliation'});
  }
  setPayAmount('');
 }
 async function addReceipt(){
  if(!selected||!currentPresentation)throw new Error('Selecciona una compra y una presentación.');
  const n=Number(receivedPacks);
  if(!Number.isFinite(n)||n<=0)throw new Error('Indica cuántos paquetes llegaron.');
  if(mode==='live'){await request('receipt.add',{purchaseId:selected.id,presentationId:currentPresentation.id,packQuantity:n,goodsStatus:receptionState});await refreshLive();}
  else{
   const product=active.products.find(p=>p.id===currentPresentation.productId)!;
   setData(d=>({...d,receipts:[...d.receipts,{id:genId(site),siteId:site,purchaseId:selected.id,
      presentationId:currentPresentation.id,presentationLabel:currentPresentation.label,productId:product.id,productName:product.name,
      packQuantity:n,receivedBaseAmount:Math.round(n*currentPresentation.unitAmount*1e6)/1e6,unit:currentPresentation.unit}]}));
   setChange(selected.id,{goodsStatus:receptionState,receiptCount:selected.receiptCount+1});
  }
 }
 async function uploadFile(){
  if(!selected||!evidence)throw new Error('Selecciona una imagen y una compra.');
  if(mode==='live'){
   if(!user)throw new Error('Inicia sesión para subir comprobantes.');
   const form=new FormData();form.append('siteId',site);form.append('purchaseId',selected.id);form.append('file',evidence);
   const token=await user.getIdToken();
   const resp=await fetch('/api/operations/evidence',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
   const ans=await resp.json() as {error?:string};
   if(!resp.ok)throw new Error(ans.error||'Error guardando comprobante.');
   await refreshLive();
  }else{
   setData(d=>({...d,documents:[...d.documents,{id:genId(site),siteId:site,purchaseId:selected.id,storagePath:'demo:'+evidence.name,mime:evidence.type,size:evidence.size}]}));
   setChange(selected.id,{documentCount:selected.documentCount+1,documentStatus:'captured'});
  }
  setEvidence(null);
 }
 async function changeDocument(next:'delivered'|'received'|'rejected'){
  if(!selected||recipient.trim().length<2)throw new Error('Indica la persona responsable de la entrega/recepción.');
  if(mode==='live'){await request('document.status',{purchaseId:selected.id,status:next,recipient});await refreshLive();}
  else setChange(selected.id,{documentStatus:next});
  setRecipient('');
 }
 async function login(){if(!auth)throw new Error('Firebase Auth no está configurado.');await signInWithEmailAndPassword(auth,email,password);setPassword('');}
 const demoMode=mode==='demo';
 const selectedRows=tab==='showroom'?initial.purchases:purchases;
 const showStats=purchaseSummary(selectedRows);
 const currentTitle=demoMode?'DEMOSTRACIÓN — NO GUARDA EN FIRESTORE':'OPERACIÓN CON AUTENTICACIÓN';
 return <div className="ops">
  <header className="ops-header"><div className="ops-header-inner">
   <div><Link href="/" className="ops-back">← Production Control</Link><h1>NIXINX <span>Operations</span></h1></div>
   <div className="ops-header-right"><span className="ops-status">{currentTitle}</span>
    <select aria-label="Modo de información" value={mode} onChange={e=>{setMode(e.target.value as ViewMode);setData(e.target.value==='demo'?initial:EMPTY_OPS);setMsg('');}}>
      <option value="demo">Demo segura</option><option value="live">Firestore autorizado</option></select>
   </div>
  </div></header>
  <main className="ops-wrap">
   <div className="ops-toolbar">
    <label>Empresa operativa<select value={site} onChange={e=>chooseSite(e.target.value as OpsSite)}>
       {SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
    <div className="ops-toolbar-note">El producto maestro, los proveedores y cada compra pertenecen a una sola empresa.</div>
   </div>
   {!demoMode&&<div className="ops-auth">
     {user?<div className="ops-flex"><span>Sesión: {user.email}</span><button onClick={()=>void work(()=>refreshLive())} disabled={busy}>Consultar empresas seleccionadas</button><button onClick={()=>void signOut(auth!)}>Salir</button></div>:
      <div className="ops-auth-form"><strong>Acceso administrativo</strong><input aria-label="Correo" placeholder="Correo electrónico" type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
       <input aria-label="Contraseña" placeholder="Contraseña" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
       <button disabled={busy||!email||!password} onClick={()=>void work(login)}>Iniciar sesión</button></div>}
     <p className="ops-hint">Para operaciones reales, el servidor exige <code>portal_users.opsSiteIds</code> y un proyecto Firebase autorizado. Preview nunca escribe en el Firestore productivo.</p>
   </div>}
   {msg&&<div className="ops-feedback" role="status">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
   <nav className="ops-tabs" aria-label="NIXINX Operations">{tabs.map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.title}</button>)}</nav>
   {tab==='compras'&&<div className="ops-layout">
    <section className="ops-card">
     <h2>Registrar compra</h2><p className="ops-hint">Compra rápida. Los productos se detallan cuando llega la mercancía.</p>
     <label>Proveedor<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Seleccionar proveedor</option>
       {active.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <div className="ops-grid-2"><label>Fecha<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></label>
      <label>Total (CAD)<input type="number" min="0.01" step="0.01" value={total} onChange={e=>setTotal(e.target.value)}/></label></div>
     <div className="ops-grid-2"><label>Pago inicial (CAD)<input type="number" min="0" step="0.01" value={initialPay} onChange={e=>setInitialPay(e.target.value)}/></label>
      <label>Medio del pago inicial<select value={initialMethod} onChange={e=>setInitialMethod(e.target.value as OpsPayment['method'])}>
       <option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="other">Otro</option></select></label></div>
     <label>Plazo del saldo a crédito (días)<input type="number" min="0" max="365" step="1" value={terms} onChange={e=>setTerms(e.target.value)}/></label>
     <label>Observaciones<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
     <button className="ops-primary" disabled={busy||!supplierId} onClick={()=>void work(addPurchase)}>Guardar compra</button>
     <p className="ops-hint">Si el pago inicial es $0, se genera una obligación por pagar. El crédito NO genera una conciliación bancaria ficticia.</p>
    </section>
    <section className="ops-card">
     <h2>Compras registradas <span className="ops-count">{active.purchases.length}</span></h2>
     <div className="ops-list">{active.purchases.map(p=><button key={p.id} className={'ops-purchase '+(selected?.id===p.id?'selected':'')} onClick={()=>setSelection(p.id)}>
      <span><strong>{p.supplierName}</strong><small>{p.purchaseDate} · {p.id.slice(0,19)}</small></span>
      <span className="ops-purchase-amount"><strong>{cash(p.totalCents)}</strong><small>Saldo {cash(p.balanceCents)}</small></span>
     </button>)}</div>
     {!active.purchases.length&&<p className="ops-hint">Sin compras registradas para esta empresa.</p>}
     {selected&&<div className="ops-detail">
      <h3>Expediente de compra</h3>
      <div className="ops-grid-2">
       <div className="ops-state"><small>Mercancía</small><strong>{status(selected.goodsStatus)}</strong></div>
       <div className="ops-state"><small>Comprobante</small><strong>{status(selected.documentStatus)}</strong></div>
       <div className="ops-state"><small>Cuenta por pagar</small><strong>{cash(selected.balanceCents)}</strong></div>
       <div className="ops-state"><small>Banco</small><strong>{status(selected.bankStatus)}</strong></div>
      </div>
      <div className="ops-divider"/>
      <h3>Registrar abono a la compra</h3>
      <div className="ops-grid-2"><label>Importe del abono<input type="number" min="0.01" step="0.01" value={payAmount} onChange={e=>setPayAmount(e.target.value)}/></label>
       <label>Medio<select value={payMethod} onChange={e=>setPayMethod(e.target.value as OpsPayment['method'])}>
        <option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="cash">Efectivo</option><option value="other">Otro</option></select></label></div>
      <button disabled={busy||selected.balanceCents===0} onClick={()=>void work(addPayment)}>Aplicar abono</button>
      <div className="ops-mini-list">{associated.map(p=><div key={p.id}>{cash(p.amountCents)} · {p.method} <small>{p.reconciliationStatus==='pending'?'Conciliación pendiente':'Sin conciliación bancaria'}</small></div>)}</div>
      <div className="ops-divider"/>
      <h3>Comprobante y entrega / recepción</h3>
      <label>Fotografía del ticket o factura<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setEvidence(e.target.files?.[0]??null)}/></label>
      <button disabled={busy||!evidence} onClick={()=>void work(uploadFile)}>Adjuntar imagen</button>
      <p className="ops-hint">{selected.documentCount} evidencia(s) registradas. Imagen privada en Firebase Storage únicamente en modo conectado.</p>
      <label>Persona que entrega / recibe<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Nombre del responsable"/></label>
      <div className="ops-flex">
       <button disabled={busy||!['captured','delivered','rejected'].includes(selected.documentStatus)} onClick={()=>void work(()=>changeDocument('delivered'))}>Marcar entregado</button>
       <button disabled={busy||selected.documentStatus!=='delivered'} onClick={()=>void work(()=>changeDocument('received'))}>Confirmar recibido</button>
       <button disabled={busy||selected.documentStatus!=='delivered'} onClick={()=>void work(()=>changeDocument('rejected'))}>Rechazar</button>
      </div>
     </div>}
    </section>
   </div>}
   {tab==='recepcion'&&<div className="ops-layout">
    <section className="ops-card"><h2>Entrada de mercancía</h2>
     <label>Compra<select value={selected?.id??''} onChange={e=>setSelection(e.target.value)}>
      <option value="">Selecciona compra</option>{active.purchases.map(p=><option key={p.id} value={p.id}>{p.supplierName} · {cash(p.totalCents)}</option>)}</select></label>
     <label>Presentación del producto<select value={receivingPresentation} onChange={e=>setReceivingPresentation(e.target.value)}>
      <option value="">Seleccionar presentación</option>{active.presentations.map(p=>{
       const product=active.products.find(x=>x.id===p.productId);return <option key={p.id} value={p.id}>{product?.name} · {p.label}</option>;
      })}</select></label>
     <div className="ops-grid-2"><label>Paquetes recibidos<input type="number" min="0.001" step="any" value={receivedPacks} onChange={e=>setReceivedPacks(e.target.value)}/></label>
      <label>Estado de recepción<select value={receptionState} onChange={e=>setReceptionState(e.target.value as 'partial'|'received')}>
       <option value="received">Recibida</option><option value="partial">Parcial</option></select></label></div>
     {currentPresentation&&<div className="ops-measure">Equivalencia de entrada<strong>
      {(Number(receivedPacks)*currentPresentation.unitAmount||0).toLocaleString('es-CA',{maximumFractionDigits:6})} {currentPresentation.unit}
     </strong><small>{receivedPacks||0} × {currentPresentation.label}</small></div>}
     <button className="ops-primary" disabled={busy||!selected||!currentPresentation} onClick={()=>void work(addReceipt)}>Guardar renglón recibido</button>
     <p className="ops-hint">Recepción física y compra son eventos separados. Esta versión registra la entrada recibida, sin descontar insumos desde Producción.</p>
    </section>
    <section className="ops-card"><h2>Detalle de recepciones</h2>
     {selected?<><p className="ops-hint">{selected.supplierName} · {selected.purchaseDate}</p>
     <div className="ops-mini-list">{active.receipts.filter(x=>x.purchaseId===selected.id).map(r=><div key={r.id}>
      <strong>{r.productName}</strong> · {r.packQuantity} × {r.presentationLabel}<small>{r.receivedBaseAmount} {r.unit}</small>
     </div>)}</div></>:<p>Selecciona una compra.</p>}
     <p className="ops-hint">La confirmación del saldo físico por presentación y los conteos de almacén se completarán en el incremento de Inventario.</p>
    </section>
   </div>}
   {tab==='catalogos'&&<div className="ops-layout">
    <section className="ops-card"><h2>Proveedores y productos maestros</h2>
     <label>Nuevo proveedor<input value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} placeholder="Nombre comercial"/></label>
     <button disabled={busy||newSupplier.trim().length<2} onClick={()=>void work(addSupplier)}>+ Agregar proveedor</button>
     <div className="ops-divider"/>
     <label>Nuevo producto maestro<input value={newProduct} onChange={e=>setNewProduct(e.target.value)} placeholder="Ej. Queso feta"/></label>
     <label>Unidad base<select value={productUnit} onChange={e=>setProductUnit(e.target.value as 'kg'|'l'|'unit')}>
      <option value="kg">Kilogramos (masa)</option><option value="l">Litros (volumen)</option><option value="unit">Piezas (conteo)</option></select></label>
     <button disabled={busy||newProduct.trim().length<2} onClick={()=>void work(addProduct)}>+ Crear producto maestro</button>
    </section>
    <section className="ops-card"><h2>Presentaciones por producto</h2>
     <label>Producto maestro<select value={presentationProduct} onChange={e=>{setPresentationProduct(e.target.value);const p=active.products.find(x=>x.id===e.target.value);if(p)setPackUnit(p.unit);}}>
      <option value="">Selecciona producto</option>{active.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <div className="ops-mini-list">{active.presentations.filter(p=>p.productId===presentationProduct).map(p=><div key={p.id}>
       {p.label}<small>{p.unitAmount} {p.unit} por paquete</small></div>)}</div>
     <div className="ops-divider"/>
     <h3>Crear nueva presentación</h3>
     <label>Nombre de presentación<input value={newPresentationLabel} onChange={e=>setNewPresentationLabel(e.target.value)} placeholder="Ej. Bolsa de 750 g"/></label>
     <div className="ops-grid-2"><label>Contenido del paquete<input type="number" min="0.001" step="any" value={packCount} onChange={e=>setPackCount(e.target.value)}/></label>
      <label>Unidad<select value={packUnit} onChange={e=>setPackUnit(e.target.value as OpsUnit)}>
       {eligibleUnits.map(u=><option key={u} value={u}>{uLabel[u]}</option>)}</select></label></div>
     <button disabled={busy||!presentationProduct||!newPresentationLabel.trim()} onClick={()=>void work(addPresentation)}>+ Guardar presentación</button>
     <p className="ops-hint">Las presentaciones se reutilizan al recibir mercancía; puedes crear nuevas sin duplicar el producto maestro.</p>
    </section>
   </div>}
   {(tab==='kpis'||tab==='showroom')&&<section className="ops-card">
     <div className="ops-section-title"><h2>{tab==='showroom'?'Showroom · datos sintéticos':'KPIs de Compras y Recepción'}</h2>
     <span className="ops-caption">{tab==='showroom'?'Ejemplo ilustrativo; no muestra clientes reales':(demoMode?'Datos demostrativos':'Datos de Firestore autorizado')}</span></div>
     <div className="ops-metrics"><div><small>Compras</small><strong>{showStats.count}</strong></div>
      <div><small>Monto comprado</small><strong>{cash(showStats.totalCents)}</strong></div>
      <div><small>Saldo por pagar</small><strong>{cash(showStats.balanceCents)}</strong></div>
      <div><small>Recepciones pendientes</small><strong>{showStats.pendingGoods}</strong></div>
      <div><small>Comprobantes sin acuse</small><strong>{showStats.pendingDocuments}</strong></div></div>
     <h3>Compras por proveedor y empresa</h3>
     <div className="ops-bars">{selectedRows.map(p=><div key={p.id} className="ops-bar-row">
      <div><strong>{p.supplierName}</strong><small>{p.siteId.toUpperCase()} · {cash(p.totalCents)}</small></div>
      <div className="ops-bar-track"><span style={{width:((p.totalCents/Math.max(1,...selectedRows.map(x=>x.totalCents)))*100)+'%'}}/></div>
     </div>)}</div>
     <p className="ops-hint">Los porcentajes y montos agregados se calculan únicamente sobre las empresas seleccionadas y autorizadas. No representan inventario de recetas.</p>
    </section>}
   {tab==='datos'&&<section className="ops-card">
    <h2>Proveedor interno para el Data Warehouse</h2><p className="ops-hint">Dominio candidato: Procesos · proveedor Software Propio · contrato v0.1. Exportación CSV de inspección, NO conector incremental certificado.</p>
    <div className="ops-grid-2">
     {['ops_purchases','ops_payments','ops_suppliers','ops_products','ops_presentations','ops_receipts','ops_documents','ops_audit'].map(x=>
      <div className="ops-table-name" key={x}><code>{x}</code></div>)}
    </div>
    <button className="ops-primary" onClick={()=>csvDownload('nixinx-ops-purchases-sample.csv',
     ['site_id','purchase_id','purchase_date','supplier_id','total_cents','paid_cents','balance_cents','goods_status','document_status','bank_status'],
     purchases.map(p=>[p.siteId,p.id,p.purchaseDate,p.supplierId,p.totalCents,p.paidCents,p.balanceCents,p.goodsStatus,p.documentStatus,p.bankStatus]))}>
     Exportar compras seleccionadas (CSV)</button>
    <p className="ops-hint">La integración RAW → CORE → MART requerirá contrato canónico, marcas de actualización, cambios, reversiones y validación formal antes del Go Live.</p>
   </section>}
   {tab==='kpis'&&<section className="ops-card"><h3>Alcance del reporte</h3>
    <div className="ops-scope">{SITES.map(s=><label key={s.id}><input type="checkbox" checked={scope.includes(s.id)} onChange={e=>setScope(curr=>e.target.checked?[...curr,s.id]:curr.filter(x=>x!==s.id))}/>{s.name}</label>)}</div>
    {!demoMode&&<p className="ops-hint">Para consultar varias empresas, selecciónalas y pulsa «Consultar empresas seleccionadas». El backend denegará cualquier empresa que no esté incluida en tus permisos.</p>}
   </section>}
   <footer className="ops-footer">NIXINX Operations · Incremento 1 (Preview) · Sin conexión automática a Producción ni Conteo de Bolsas</footer>
  </main>
 </div>;
}
