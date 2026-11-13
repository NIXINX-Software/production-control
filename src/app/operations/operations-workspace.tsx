'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {auth} from '@/lib/firebase';
import {PC_UNITS} from '@/lib/pc-units';
import {baseAmount,bankStatusForPayments,EMPTY_OPS,normalUnit,purchaseBalances,purchaseSummary,
 type OpsSite,type OpsUnit,type OpsSnapshot,type OpsPurchase,type OpsPayment,type OpsPresentation} from '@/lib/ops-contract';
import './operations.css';

type Panel='compras'|'recepcion'|'conciliacion'|'catalogos'|'kpis'|'showroom'|'datos';
type Workspace='admin'|'compras'|'control';
type Tender={id:string;method:OpsPayment['method'];amount:string};
const tenderMethods:{value:OpsPayment['method'];label:string}[]=[{value:'cash',label:'Efectivo'},{value:'debit_card',label:'Tarjeta de débito'},{value:'credit_card',label:'Tarjeta de crédito'},{value:'transfer',label:'Transferencia'},{value:'credit_note',label:'Nota de crédito del proveedor'},{value:'other',label:'Otro'}];
type ViewMode='demo'|'live';
const SITES:{id:OpsSite;name:string}[]=[{id:'htl',name:'Hot Tacos Leamington'},{id:'htw',name:'Hot Tacos Windsor'},{id:'htft',name:'Hot Tacos Food Truck'}];
const dateToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const cash=(cents:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(cents/100);
const genId=(s:OpsSite)=>s+'_'+crypto.randomUUID();
const uLabel:Record<OpsUnit,string>=Object.fromEntries(PC_UNITS.map(u=>[u.id,u.es])) as Record<OpsUnit,string>;
const tabs:{id:Panel;title:string}[]=[{id:'compras',title:'Compras'},{id:'recepcion',title:'Recepción'},{id:'conciliacion',title:'Conciliación'},{id:'catalogos',title:'Catálogos'},
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
async function resizeEvidence(input:File):Promise<File>{
 if(!input.type.startsWith('image/'))throw new Error('Selecciona una fotografía del comprobante.');
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(input);}catch{throw new Error('No se pudo procesar la imagen. Prueba con JPG, PNG o WebP.');}
 const max=1600,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
 const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('No se pudo preparar la imagen.');}
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo comprimir la imagen.')),'image/jpeg',0.74));
 if(blob.size>8*1024*1024)throw new Error('La imagen supera el límite de 8 MB.');
 return new File([blob],`comprobante-${Date.now()}.jpg`,{type:'image/jpeg'});
}
export default function Operations({workspace='admin'}:{workspace?:Workspace}){
 const [tab,setTab]=useState<Panel>(workspace==='control'?'recepcion':'compras'),[mode,setMode]=useState<ViewMode>(workspace==='admin'?'demo':'live'),[site,setSite]=useState<OpsSite>('htl');
 const [scope,setScope]=useState<OpsSite[]>(['htl']),[data,setData]=useState<OpsSnapshot>(EMPTY_OPS);
 const [superadminVerified,setSuperadminVerified]=useState(false);
 const [workspaceAuthorized,setWorkspaceAuthorized]=useState(false),[workspaceError,setWorkspaceError]=useState('');
 const [workspaceRole,setWorkspaceRole]=useState<string|null>(null);
 const [showroomAuthorized,setShowroomAuthorized]=useState(false),[showroomData,setShowroomData]=useState<OpsSnapshot|null>(null);
 const [user,setUser]=useState<User|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[selection,setSelection]=useState('');
 const [supplierId,setSupplierId]=useState(''),[total,setTotal]=useState(''),[purchaseDate,setPurchaseDate]=useState(dateToday());
 const [editingPurchase,setEditingPurchase]=useState(''),[editSupplier,setEditSupplier]=useState(''),[editDate,setEditDate]=useState(''),[editTotal,setEditTotal]=useState(''),[editNotes,setEditNotes]=useState('');
 const [terms,setTerms]=useState(''),[tenders,setTenders]=useState<Tender[]>([]),[notes,setNotes]=useState('');
 const [historyOpen,setHistoryOpen]=useState(false),[historyLoaded,setHistoryLoaded]=useState(false),[recentSaved,setRecentSaved]=useState('');
 const [queryFrom,setQueryFrom]=useState(()=>{const d=new Date();d.setDate(d.getDate()-30);return d.toLocaleDateString('en-CA',{timeZone:'America/Toronto'});}),[queryTo,setQueryTo]=useState(dateToday());
 const [receiptDeliveredAtPurchase,setReceiptDeliveredAtPurchase]=useState(false),[inlineNewSupplier,setInlineNewSupplier]=useState(false),[inlineNewProduct,setInlineNewProduct]=useState(false),[inlineNewPresentation,setInlineNewPresentation]=useState(false);
 const [payAmount,setPayAmount]=useState(''),[payMethod,setPayMethod]=useState<OpsPayment['method']>('transfer');
 const [recipient,setRecipient]=useState(''),[evidence,setEvidence]=useState<File|null>(null),[existingEvidence,setExistingEvidence]=useState<File|null>(null);
 const [newSupplier,setNewSupplier]=useState(''),[newProduct,setNewProduct]=useState(''),[productUnit,setProductUnit]=useState<'kg'|'l'|'unit'>('kg');
 const [editingProduct,setEditingProduct]=useState<string|null>(null),[catalogSearch,setCatalogSearch]=useState('');
 const [presentationProduct,setPresentationProduct]=useState(''),[newPresentationLabel,setNewPresentationLabel]=useState('');
 const [editingPresentation,setEditingPresentation]=useState<string|null>(null);
 const [packCount,setPackCount]=useState(''),[packUnit,setPackUnit]=useState<OpsUnit>('g');
 const [receivingProduct,setReceivingProduct]=useState(''),[receivingPresentation,setReceivingPresentation]=useState(''),[receivedPacks,setReceivedPacks]=useState(''),[lineCost,setLineCost]=useState('');
 const [receptionState,setReceptionState]=useState<'partial'|'received'>('received');
 useEffect(()=>{
   if(!auth)return;
   return onAuthStateChanged(auth,account=>{
     setUser(account);
     setShowroomAuthorized(false);
     setShowroomData(null);
     if(!account){setWorkspaceAuthorized(false);setTab(workspace==='control'?'recepcion':'compras');}
   });
 },[workspace]);
 // Showroom credentials are verified independently from the Operations sandbox.
 // The synthetic fixture never ships in the public Operations JavaScript bundle.
 useEffect(()=>{
   if(!user)return;
   let active=true;
   user.getIdToken().then(async token=>{
     const response=await fetch('/api/operations/showroom',{
       headers:{Authorization:'Bearer '+token},cache:'no-store'
     });
     if(!response.ok)throw new Error('SHOWROOM_FORBIDDEN');
     const payload=await response.json() as {synthetic?:boolean;data?:OpsSnapshot};
     if(payload.synthetic!==true||!payload.data)throw new Error('INVALID_SHOWROOM_RESPONSE');
     return payload.data;
   }).then(dataset=>{
     if(!active)return;
     setShowroomData(dataset);
     setShowroomAuthorized(true);
   }).catch(()=>{
     if(!active)return;
     setShowroomData(null);
     setShowroomAuthorized(false);
     setTab(current=>current==='showroom'?'compras':current);
   });
   return ()=>{active=false;};
 },[user]);
 useEffect(()=>{
   if(workspace==='admin'||!user)return;
   let active=true;
   user.getIdToken().then(async token=>{
    const response=await fetch('/api/operations?view=access&site='+site,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const result=await response.json() as {role?:string;error?:string};
    if(!response.ok)throw new Error(result.error??'No autorizado');
    if(!(result.role==='admin'||(workspace==='compras'&&result.role==='ops_buyer')||(workspace==='control'&&result.role==='ops_backoffice')))throw new Error('Esta cuenta no tiene acceso a este espacio.');
    return result.role;
   }).then(role=>{if(active){setWorkspaceAuthorized(true);setWorkspaceRole(role??null);setWorkspaceError('');}})
     .catch(e=>{if(active){setWorkspaceAuthorized(false);setWorkspaceRole(null);setWorkspaceError(e instanceof Error?e.message:'Acceso denegado');}});
   return ()=>{active=false;};
 },[workspace,user,site]);
 useEffect(()=>{
   if(mode!=='live')return;
   let cancelled=false;
   Promise.resolve().then(async ()=>{
     const response=await fetch('/api/operations?site='+site,{cache:'no-store'});
     const result=await response.json() as {data?:OpsSnapshot;error?:string};
     if(!response.ok||!result.data)throw new Error(result.error||'Sin autorización de consulta.');
     return result.data;
   }).then(result=>{
     if(cancelled)return;
     setData(result);setSuperadminVerified(workspace==='admin'&&showroomAuthorized);
     setMsg('');
   }).catch(err=>{
     if(cancelled)return;
     setSuperadminVerified(false);setData(EMPTY_OPS);
     setMsg('No se pudieron cargar los catálogos de Firestore: '+(err instanceof Error?err.message:'error desconocido'));
   });
   return ()=>{cancelled=true;};
 },[mode,user,site,workspace,workspaceAuthorized]);
 const active=useMemo(()=>filterSite(data,site),[data,site]);
 const purchases=useMemo(()=>data.purchases.filter(p=>scope.includes(p.siteId)),[data,scope]);
 const selected=data.purchases.find(p=>p.id===selection&&p.siteId===site);
 const supplier=active.suppliers.find(x=>x.id===supplierId);
 const presentationProductObj=active.products.find(x=>x.id===presentationProduct);
 const eligibleUnits=PC_UNITS.map(u=>u.id).filter(u=>presentationProductObj&&normalUnit(u)===presentationProductObj.unit);
 const currentPresentation=active.presentations.find(x=>x.id===receivingPresentation&&x.productId===receivingProduct);
 const receivingProductObj=active.products.find(x=>x.id===receivingProduct);
 const receivingPresentations=active.presentations.filter(x=>x.productId===receivingProduct&&x.active);
 const nameKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim().replace(/\s+/g,' ');
 const alreadyExists=active.products.find(p=>nameKey(p.name)===nameKey(newProduct)&&p.id!==editingProduct);
 const tenderTotalCents=tenders.reduce((sum,p)=>sum+(p.amount.trim()?Math.round(Number(p.amount.replace(',','.'))*100):0),0);
 const draftCents=total.trim()?Math.round(Number(total.replace(',','.'))*100):0;
 const draftBalance=draftCents-tenderTotalCents;
 const associated=selected?data.payments.filter(p=>p.purchaseId===selected.id):[];
 const setChange=(purchaseId:string,patch:Partial<OpsPurchase>)=>setData(d=>({...d,purchases:d.purchases.map(p=>p.id===purchaseId?{...p,...patch}:p)}));
 async function request(action:string,payload:Record<string,unknown>,siteId:OpsSite=site){
  const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({...payload,siteId,action})});
  const result=await response.json() as {ok?:boolean;id?:string;error?:string};
  if(!response.ok)throw new Error(result.error||'No se pudo completar la operación.');
  return result;
 }
 async function refreshLive(nextScope:OpsSite[]=scope){
  const requests=await Promise.all(nextScope.map(async id=>{
   const resp=await fetch('/api/operations?site='+id,{cache:'no-store'});
   const result=await resp.json() as {data?:OpsSnapshot;error?:string};
   if(!resp.ok||!result.data)throw new Error(id.toUpperCase()+': '+(result.error||String(resp.status)));
   return result.data;
  }));
  setSuperadminVerified(false);
  setData({products:requests.flatMap(d=>d.products),suppliers:requests.flatMap(d=>d.suppliers),
    presentations:requests.flatMap(d=>d.presentations),purchases:requests.flatMap(d=>d.purchases),
    payments:requests.flatMap(d=>d.payments),receipts:requests.flatMap(d=>d.receipts),
    documents:requests.flatMap(d=>d.documents)});
  setSuperadminVerified(workspace==='admin'&&showroomAuthorized);
 }
 async function consultHistory(){
  if(!queryFrom||!queryTo||queryFrom>queryTo)throw new Error('Selecciona un periodo válido.');
  const days=Math.round((Date.parse(queryTo)-Date.parse(queryFrom))/86400000);
  if(days>366)throw new Error('El periodo máximo de consulta es de 12 meses.');
  if(mode==='live'){
 
   const url='/api/operations?view=history&site='+site+'&from='+encodeURIComponent(queryFrom)+'&to='+encodeURIComponent(queryTo);
   const response=await fetch(url,{cache:'no-store'});
   const body=await response.json() as {purchases?:OpsPurchase[];hasMore?:boolean;error?:string};
   if(!response.ok||!body.purchases)throw new Error(body.error||'Consulta fallida.');
   setData(current=>({...current,purchases:[...current.purchases.filter(p=>p.siteId!==site),...body.purchases!]}));
   if(body.hasMore)setMsg('El periodo contiene más de 200 compras: ajusta las fechas para evitar omisiones.');
  }
  setHistoryLoaded(true);
 }
 const matchedRows=active.purchases.filter(p=>p.purchaseDate>=queryFrom&&p.purchaseDate<=queryTo)
  .sort((a,b)=>b.purchaseDate.localeCompare(a.purchaseDate)||b.id.localeCompare(a.id));
 const bankLabel=(p:OpsPurchase)=>{
   const payRows=data.payments.filter(row=>row.purchaseId===p.id);
   if(p.balanceCents===p.totalCents)return 'Crédito sin pago';
   if(p.bankStatus==='not_applicable'||payRows.length>0&&payRows.every(x=>x.reconciliationStatus==='not_applicable'))return 'Sin cargo bancario';
   return 'Pendiente de statement';
 };
 const bankVerified=(p:OpsPurchase)=>p.bankStatus==='reconciled';
 async function work(job:()=>Promise<void>){setBusy(true);setMsg('');try{await job();setMsg(current=>current||'Operación completada.');}
  catch(e){setMsg('No se completó: '+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}}
 function chooseSite(v:OpsSite){setWorkspaceAuthorized(false);setWorkspaceRole(null);setSite(v);setScope([v]);setSuperadminVerified(false);if(tab==='datos')setTab('compras');setSelection('');setSupplierId('');setPresentationProduct('');setReceivingProduct('');setReceivingPresentation('');setHistoryLoaded(false);setHistoryOpen(false);setRecentSaved('');}
 async function addSupplier(){
  if(newSupplier.trim().length<2)throw new Error('Escribe el nombre del proveedor.');
  if(mode==='live'){const result=await request('supplier.add',{name:newSupplier});await refreshLive();if(result.id)setSupplierId(result.id);}
  else {const id=genId(site);setData(d=>({...d,suppliers:[...d.suppliers,{id,siteId:site,name:newSupplier.trim(),active:true}]}));setSupplierId(id);}
  setNewSupplier('');setInlineNewSupplier(false);
 }
 async function addProduct(){
  if(newProduct.trim().length<2)throw new Error('Escribe el nombre del producto maestro.');
  if(alreadyExists)throw new Error('Este producto maestro ya existe. Selecciónalo y agrega la presentación que necesites.');
  if(mode==='live'){const r=await request('product.add',{name:newProduct,unit:productUnit});await refreshLive();if(r.id){setPresentationProduct(r.id);setReceivingProduct(r.id);setReceivingPresentation('');setPackUnit(productUnit);}}
  else{const id=genId(site);setData(d=>({...d,products:[...d.products,{id,siteId:site,name:newProduct.trim(),unit:productUnit,active:true}]}));setPresentationProduct(id);setReceivingProduct(id);setReceivingPresentation('');setPackUnit(productUnit);}
  setNewProduct('');setInlineNewProduct(false);
 }
 async function saveProductEdit(){
  if(!editingProduct)throw new Error('Selecciona el producto.');
  if(alreadyExists)throw new Error('Ya existe otro producto maestro con ese nombre.');
  if(newProduct.trim().length<2)throw new Error('Escribe un nombre válido.');
  if(mode==='live'){await request('product.update',{productId:editingProduct,name:newProduct.trim(),unit:productUnit});await refreshLive();}
  else setData(d=>({...d,products:d.products.map(p=>p.id===editingProduct?{...p,name:newProduct.trim(),unit:productUnit,active:true}:p)}));
  setEditingProduct(null);setNewProduct('');
 }
 async function removeProduct(id:string,kind:'delete'|'deactivate'){
  const target=active.products.find(p=>p.id===id);
  if(!target)throw new Error('Producto no encontrado.');
  if(!window.confirm(kind==='delete'?`¿Eliminar definitivamente "${target.name}"? Solo se permitirá si no hay registros vinculados.`:`¿Desactivar "${target.name}"? Permanecerá en el historial, pero no se usará en nuevas recepciones.`))return;
  if(mode==='live'){await request(kind==='delete'?'product.delete':'product.deactivate',{productId:id});await refreshLive();}
  else{
   const inUse=data.presentations.some(p=>p.productId===id)||data.receipts.some(r=>r.productId===id);
   if(kind==='delete'&&inUse)throw new Error('PRODUCT_IN_USE_DEACTIVATE_INSTEAD');
   setData(d=>({...d,products:kind==='delete'?d.products.filter(p=>p.id!==id):d.products.map(p=>p.id===id?{...p,active:false}:p)}));
  }
  if(editingProduct===id){setEditingProduct(null);setNewProduct('');}
 }
 async function addPresentation(){
  if(!presentationProductObj)throw new Error('Selecciona el producto maestro.');
  const n=Number(packCount);
  if(!newPresentationLabel.trim()||!Number.isFinite(n)||n<=0||normalUnit(packUnit)!==presentationProductObj.unit)throw new Error('Presentación o unidad inválida.');
  if(mode==='live'){const r=await request(editingPresentation?'presentation.update':'presentation.add',{...(editingPresentation?{presentationId:editingPresentation}:{productId:presentationProductObj.id}),label:newPresentationLabel,packCount:n,packUnit});await refreshLive();if(r.id)setReceivingPresentation(r.id);}
  else{const id=editingPresentation??genId(site),p:OpsPresentation={id,siteId:site,productId:presentationProductObj.id,label:newPresentationLabel.trim(),packCount:n,packUnit,unitAmount:baseAmount(n,packUnit),unit:presentationProductObj.unit,active:true};
    if(editingPresentation&&data.receipts.some(r=>r.presentationId===id))throw new Error('PRESENTATION_IN_USE_CREATE_NEW_INSTEAD');
    setData(d=>({...d,presentations:editingPresentation?d.presentations.map(row=>row.id===id?p:row):[...d.presentations,p]}));setReceivingPresentation(id);}
  setNewPresentationLabel('');setInlineNewPresentation(false);setEditingPresentation(null);
 }
 async function removePresentation(p:OpsPresentation,kind:'delete'|'deactivate'){
  if(!window.confirm(kind==='delete'?`¿Eliminar definitivamente ${p.label}?`:`¿Desactivar ${p.label}?`))return;
  if(mode==='live'){await request(kind==='delete'?'presentation.delete':'presentation.deactivate',{presentationId:p.id});await refreshLive();}
  else{if(kind==='delete'&&data.receipts.some(r=>r.presentationId===p.id))throw new Error('PRESENTATION_IN_USE_DEACTIVATE_INSTEAD');setData(d=>({...d,presentations:kind==='delete'?d.presentations.filter(x=>x.id!==p.id):d.presentations.map(x=>x.id===p.id?{...x,active:false}:x)}));}
  if(editingPresentation===p.id){setEditingPresentation(null);setNewPresentationLabel('');}
 }
 async function addPurchase(){
  const cents=Math.round(Number(total.replace(',','.'))*100);
  if(!supplier||!Number.isSafeInteger(cents)||cents<1)throw new Error('Selecciona un proveedor y un importe válido.');
  const payments:{method:OpsPayment['method'];amountCents:number}[]=[];
  for(const p of tenders){
   const amountCents=Math.round(Number(p.amount.replace(',','.'))*100);
   if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw new Error('Captura un importe válido en cada medio de pago.');
   payments.push({method:p.method,amountCents});
  }
  const b=purchaseBalances(cents,payments.map(p=>p.amountCents));
  const days=terms.trim()?Number(terms):null;
  if(days!==null&&(!Number.isInteger(days)||days<1||days>365))throw new Error('El plazo de crédito debe ser de 1 a 365 días o dejarse en blanco.');
  if(receiptDeliveredAtPurchase&&!evidence)throw new Error('Adjunta el comprobante antes de marcarlo como entregado.');
  if(mode==='live'){
   const result=await request('purchase.add',{supplierId:supplier.id,totalCents:cents,purchaseDate,termsDays:days,initialPayments:payments,notes});
   if(!result.id)throw new Error('La compra no devolvió identificador.');
   setSelection(result.id);
   await refreshLive();
   if(evidence){
    try{
     await uploadFileFor(result.id,evidence);
     if(receiptDeliveredAtPurchase){await request('document.status',{purchaseId:result.id,status:'delivered',recipient:user?.email||'Compras'});await refreshLive();}
    }catch(error){throw new Error('La compra '+result.id+' se guardó, pero el comprobante quedó pendiente: '+(error instanceof Error?error.message:String(error))+'. Selecciona la compra y vuelve a adjuntarlo.');}
   }
  }else{
   const id=genId(site);
   const due=b.balanceCents&&days!==null?new Date(Date.parse(purchaseDate+'T12:00:00Z')+days*86400000).toISOString().slice(0,10):null;
   const row:OpsPurchase={id,siteId:site,purchaseDate,supplierId:supplier.id,supplierName:supplier.name,totalCents:cents,
     currency:'CAD',...b,dueDate:due,goodsStatus:'pending',documentStatus:evidence?(receiptDeliveredAtPurchase?'delivered':'captured'):'missing',
     bankStatus:bankStatusForPayments(payments.map(p=>p.method)),receiptCount:0,documentCount:evidence?1:0,
     receiptDelivered:receiptDeliveredAtPurchase,receiptAcknowledged:false,notes};
   const rows:OpsPayment[]=payments.map(p=>({id:genId(site),siteId:site,purchaseId:id,amountCents:p.amountCents,method:p.method,
     reconciliationStatus:['cash','credit_note'].includes(p.method)?'not_applicable':'pending',paidDate:purchaseDate}));
   setData(d=>({...d,purchases:[row,...d.purchases],payments:[...d.payments,...rows],
     documents:evidence?[...d.documents,{id:genId(site),siteId:site,purchaseId:id,storagePath:'demo:image-resized-locally',mime:'image/jpeg',size:evidence.size}]:d.documents}));
   setSelection(id);
  }
  setNotes('');setTerms('');setTotal('');setTenders([]);setEvidence(null);setReceiptDeliveredAtPurchase(false);setRecentSaved('Compra guardada. Para consultarla o hacer seguimiento utiliza un periodo de fechas.');setHistoryLoaded(false);
 }
 function openPurchaseEdit(p:OpsPurchase){
  setSelection(p.id);setEditingPurchase(p.id);setEditSupplier(p.supplierId);setEditDate(p.purchaseDate);setEditTotal((p.totalCents/100).toFixed(2));setEditNotes(p.notes??'');
 }
 async function savePurchaseEdit(){
  const p=active.purchases.find(x=>x.id===editingPurchase);
  if(!p)throw new Error('No se encontró la compra.');
  const amount=Math.round(Number(editTotal.replace(',','.'))*100);
  if(!Number.isSafeInteger(amount)||amount<1||amount<p.paidCents)throw new Error('Importe inválido o inferior a los pagos registrados.');
  if(mode==='live'){await request('purchase.update',{purchaseId:p.id,supplierId:editSupplier,purchaseDate:editDate,totalCents:amount,notes:editNotes});await refreshLive();}
  else setData(d=>({...d,purchases:d.purchases.map(x=>x.id===p.id?{...x,supplierId:editSupplier,supplierName:active.suppliers.find(v=>v.id===editSupplier)?.name??x.supplierName,purchaseDate:editDate,totalCents:amount,balanceCents:amount-x.paidCents,notes:editNotes}:x)}));
  setEditingPurchase('');setMsg('Compra actualizada.');
 }
 async function cancelPurchase(p:OpsPurchase){
  const reason=window.prompt('Motivo de cancelación (la compra quedará en el historial):');
  if(reason===null)return;
  if(reason.trim().length<5)throw new Error('Indica un motivo de al menos 5 caracteres.');
  if(!window.confirm('¿Confirmar la cancelación de esta compra? No se eliminará su auditoría.'))return;
  if(mode==='live'){await request('purchase.cancel',{purchaseId:p.id,reason:reason.trim()});await refreshLive();}
  else setData(d=>({...d,purchases:d.purchases.map(x=>x.id===p.id?{...x,cancelled:true}:x)}));
  setEditingPurchase('');setMsg('Compra cancelada; historial conservado.');
 }
 async function addPayment(){
  if(!selected)throw new Error('Selecciona una compra.');
  const cents=Math.round(Number(payAmount)*100);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>selected.balanceCents)throw new Error('El abono debe ser mayor que cero y no superar la deuda.');
  if(mode==='live'){await request('payment.add',{purchaseId:selected.id,amountCents:cents,method:payMethod,paidDate:dateToday()});await refreshLive();}
  else{
   const row:OpsPayment={id:genId(site),siteId:site,purchaseId:selected.id,amountCents:cents,method:payMethod,
     reconciliationStatus:['cash','credit_note'].includes(payMethod)?'not_applicable':'pending',paidDate:dateToday()};
   setData(d=>({...d,payments:[...d.payments,row]}));
   setChange(selected.id,{paidCents:selected.paidCents+cents,balanceCents:selected.balanceCents-cents,
     bankStatus:['cash','credit_note'].includes(payMethod)?selected.bankStatus:'pending_reconciliation'});
  }
  setPayAmount('');
 }
 async function addReceipt(){
  if(!selected||!currentPresentation)throw new Error('Selecciona una compra y una presentación.');
  const n=Number(receivedPacks),costCents=lineCost.trim()?Math.round(Number(lineCost)*100):null;
  if(costCents!==null&&(!Number.isSafeInteger(costCents)||costCents<0))throw new Error('El costo de esta línea debe ser un importe válido.');
  if(!Number.isFinite(n)||n<=0)throw new Error('Indica cuántos paquetes llegaron.');
  if(mode==='live'){await request('receipt.add',{purchaseId:selected.id,presentationId:currentPresentation.id,packQuantity:n,lineTotalCents:costCents,goodsStatus:receptionState});await refreshLive();}
  else{
   const product=active.products.find(p=>p.id===currentPresentation.productId)!;
   setData(d=>({...d,receipts:[...d.receipts,{id:genId(site),siteId:site,purchaseId:selected.id,
      presentationId:currentPresentation.id,presentationLabel:currentPresentation.label,productId:product.id,productName:product.name,
      packQuantity:n,receivedBaseAmount:Math.round(n*currentPresentation.unitAmount*1e6)/1e6,unit:currentPresentation.unit,lineTotalCents:costCents}]}));
   setChange(selected.id,{goodsStatus:receptionState,receiptCount:selected.receiptCount+1});
  }
  setLineCost('');
 }
 async function verifyGoods(){
  if(!selected||selected.goodsStatus!=='received'||selected.receiptCount<1)throw new Error('Registra los artículos y confirma que la mercancía está completa.');
  if(mode==='live'){await request('goods.verify',{purchaseId:selected.id,verifier:user?.email||'Almacén'});await refreshLive();}
  else setChange(selected.id,{goodsStatus:'verified'});
 }
 async function viewEvidence(id:string){
 
  const popup=window.open('about:blank','_blank');
  try{
   const resp=await fetch('/api/operations/evidence?siteId='+site+'&documentId='+encodeURIComponent(id));
   const result=await resp.json() as {url?:string;error?:string};
   if(!resp.ok||!result.url)throw new Error(result.error||'No se pudo consultar el documento.');
   if(popup)popup.location.replace(result.url);else window.location.assign(result.url);
  }catch(e){popup?.close();throw e;}
 }
 async function uploadFileFor(purchaseId:string,file:File){
  const compressed=await resizeEvidence(file);
  if(mode==='live'){
 
   const form=new FormData();form.append('siteId',site);form.append('purchaseId',purchaseId);form.append('file',compressed);
   const resp=await fetch('/api/operations/evidence',{method:'POST',body:form});
   const ans=await resp.json() as {error?:string};
   if(!resp.ok)throw new Error(ans.error||'Error guardando el comprobante.');
   await refreshLive();
  }else{
   setData(d=>({...d,documents:[...d.documents,{id:genId(site),siteId:site,purchaseId,storagePath:'demo:local-compressed-image',mime:compressed.type,size:compressed.size}],
     purchases:d.purchases.map(p=>p.id===purchaseId?{...p,documentCount:p.documentCount+1,documentStatus:'captured'}:p)}));
  }
 }
 async function uploadFile(){
  if(!selected||!existingEvidence)throw new Error('Selecciona una imagen y una compra.');
  await uploadFileFor(selected.id,existingEvidence);setExistingEvidence(null);
 }
 async function changeDocument(next:'delivered'|'received'|'rejected',purchase:OpsPurchase|undefined=selected){
  if(!purchase)throw new Error('Selecciona una compra.');
  if(mode==='live'){await request('document.status',{purchaseId:purchase.id,status:next,recipient:recipient.trim()||user?.email||'Compras'});await refreshLive();}
  else setChange(purchase.id,{documentStatus:next,receiptDelivered:next==='delivered'||next==='received',receiptAcknowledged:next==='received'});
  setRecipient('');
 }
 async function downloadProtectedPurchases(){
  if(!user||!superadminVerified||mode!=='live')throw new Error('Solo Superadmin autorizado puede exportar información.');
  const token=await user.getIdToken();
  const response=await fetch('/api/operations?site='+site+'&view=export',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok){const err=await response.json() as {error?:string};throw new Error(err.error||'La exportación fue denegada.');}
  if(!response.headers.get('content-type')?.includes('text/csv'))throw new Error('El servidor no devolvió un archivo CSV válido.');
  const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download='operations_'+site+'_purchases.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function login(){if(!auth)throw new Error('Firebase Auth no está configurado.');await signInWithEmailAndPassword(auth,email,password);setPassword('');}
 const demoMode=mode==='demo';
 const showroomVisible=Boolean(workspace==='admin'&&user&&showroomAuthorized&&showroomData);
 const selectedRows=tab==='showroom'&&showroomVisible?showroomData?.purchases??[]:purchases;
 const showStats=purchaseSummary(selectedRows);
 const currentTitle=demoMode?'DEMOSTRACIÓN EN MEMORIA · CATÁLOGOS VACÍOS':'OPERACIÓN POR ÁREA';
 const accessReady=workspace==='admin'?showroomAuthorized:true;
 const canNavigate=workspace==='admin'&&showroomAuthorized;
 if(!accessReady)return <main className="ops ops-wrap"><section className="ops-card" style={{maxWidth:480,margin:'64px auto'}}>
  <h1>{workspace==='admin'?'Administración general':workspace==='compras'?'Registro de compras':'Control de recepción y conciliación'}</h1>
  <p className="ops-hint">La navegación entre áreas está reservada a Superadmin.</p>
  <label>Empresa operativa<select value={site} onChange={e=>{setWorkspaceAuthorized(false);chooseSite(e.target.value as OpsSite);}}>{SITES.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  {user?<><p>Sesión: {user.email}</p><p role="alert">{workspaceError||'Verificando autorización…'}</p><button onClick={()=>void signOut(auth!)}>Cambiar de cuenta</button></>:
   <div className="ops-auth-form"><label>Correo<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button disabled={!email||!password||busy} onClick={()=>void work(login)}>Iniciar sesión</button></div>}
  {msg&&<p role="alert">{msg}</p>}
 </section></main>;
 return <div className="ops">
  <header className="ops-header"><div className="ops-header-inner">
   <div>{canNavigate&&<nav className="ops-flex" aria-label="Navegación Superadmin"><Link href="/">Producción y Conteos</Link><Link href="/compras">Compras</Link><Link href="/control-operativo">Control operativo</Link><Link href="/operations">Administración general</Link></nav>}<h1>{workspace==='compras'?'Compras':workspace==='control'?'Recepción y conciliación':'Administración general'}</h1></div>
   <div className="ops-header-right"><span className="ops-status">{currentTitle}</span>
    {workspace==='admin'&&<select aria-label="Modo de información" value={mode} onChange={e=>{setMode(e.target.value as ViewMode);setData(EMPTY_OPS);setSuperadminVerified(false);setTab('compras');setHistoryLoaded(false);setHistoryOpen(false);setRecentSaved('');setSelection('');setSupplierId('');setPresentationProduct('');setReceivingProduct('');setReceivingPresentation('');setMsg('');}}>
      <option value="demo">Demo segura</option><option value="live">Firestore autorizado</option></select>}
   </div>
  </div></header>
  <main className="ops-wrap">
   <div className="ops-toolbar">
    <label>Empresa operativa<select value={site} onChange={e=>chooseSite(e.target.value as OpsSite)}>
       {SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
    {workspace==="admin"&&<div className="ops-toolbar-note">Los catálogos operativos se consultan desde Firestore por empresa. En Demo se crean en memoria y no quedan guardados.</div>}
   </div>
   {workspace==='admin'&&!demoMode&&<div className="ops-auth">
     {user?<div className="ops-flex"><span>Sesión: {user.email}</span><button onClick={()=>void work(()=>refreshLive())} disabled={busy}>Consultar empresas seleccionadas</button><button onClick={()=>{setSuperadminVerified(false);setShowroomAuthorized(false);setShowroomData(null);setData(EMPTY_OPS);setTab('compras');void signOut(auth!);}}>Salir</button></div>:
      <div className="ops-auth-form"><strong>Acceso administrativo</strong><input aria-label="Correo" placeholder="Correo electrónico" type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
       <input aria-label="Contraseña" placeholder="Contraseña" type="password" value={password} onChange={e=>setPassword(e.target.value)}/>
       <button disabled={busy||!email||!password} onClick={()=>void work(login)}>Iniciar sesión</button></div>}
     <p className="ops-hint">Para operaciones reales, el servidor exige <code>portal_users.opsSiteIds</code> y un proyecto Firebase autorizado. Preview nunca escribe en el Firestore productivo.</p>
   </div>}
   {msg&&<div className="ops-feedback" role="status">{msg}<button onClick={()=>setMsg('')}>×</button></div>}
   <nav className="ops-tabs" aria-label="Operaciones">{tabs.filter(t=>workspace==='compras'?t.id==='compras':workspace==='control'?['recepcion','conciliacion','catalogos','kpis'].includes(t.id):
      t.id==='showroom'?showroomVisible:
      t.id==='datos'?(!demoMode&&user&&superadminVerified):true
    ).map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.title}</button>)}</nav>
   {tab==='compras'&&<div className="ops-capture-layout">
    <section className="ops-card ops-purchase-form">
     <h2>Nueva compra</h2>
     <label>Proveedor<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Seleccionar proveedor</option>
       {active.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <div className="ops-quick-add"><button type="button" onClick={()=>setInlineNewSupplier(p=>!p)}>{inlineNewSupplier?'Cancelar':'+ Proveedor'}</button></div>
     {inlineNewSupplier&&<div className="ops-inline-editor">
       <label>Nombre del proveedor<input value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} placeholder="Ej. Proveedor local"/></label>
       <button disabled={busy||newSupplier.trim().length<2} onClick={()=>void work(addSupplier)}>Guardar y seleccionar proveedor</button>
     </div>}
     <div className="ops-grid-2"><label>Fecha<input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></label>
      <label>Total de la compra (CAD)<input type="text" inputMode="decimal" placeholder="0.00" value={total} onChange={e=>setTotal(e.target.value)}/></label></div>
     <div className="ops-payments-title"><h3>Pago</h3><button type="button" onClick={()=>setTenders(rows=>[...rows,{id:crypto.randomUUID(),method:'cash',amount:''}])}>+ Otro medio</button></div>
     <div className="ops-payments-compact">
       {tenders.map(p=><div className="ops-payment-line" key={p.id}>
        <label>Medio<select aria-label="Medio de pago" value={p.method} onChange={e=>setTenders(rows=>rows.map(x=>x.id===p.id?{...x,method:e.target.value as OpsPayment['method']}:x))}>
         {tenderMethods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <label>Importe (CAD)<input aria-label="Importe de este pago" type="text" inputMode="decimal" placeholder="0.00" value={p.amount} onChange={e=>setTenders(rows=>rows.map(x=>x.id===p.id?{...x,amount:e.target.value}:x))}/></label>
        <button className="ops-delete-tender" type="button" aria-label="Eliminar medio de pago" onClick={()=>setTenders(rows=>rows.filter(x=>x.id!==p.id))}>×</button>
       </div>)}
     </div>
     {tenders.length===0&&<p className="ops-hint">Sin pago inicial: la compra queda a crédito. Agrega los medios que sí se usaron.</p>}
     <div className="ops-payment-summary ops-payment-summary-compact">
       <div><span>Compra</span><strong>{draftCents>0?cash(draftCents):'—'}</strong></div>
       <div><span>Pagos registrados</span><strong>{Number.isFinite(tenderTotalCents)?cash(tenderTotalCents):'—'}</strong></div>
       {draftCents>0&&draftBalance>0&&<div className="ops-remaining"><span>Saldo pendiente (crédito)</span><strong>{cash(draftBalance)}</strong></div>}
       {draftCents>0&&draftBalance===0&&<div className="ops-remaining"><span>Compra cubierta</span><strong>✓</strong></div>}
     </div>
     {draftBalance>0&&<label>Plazo pactado a crédito (días, opcional)<input type="number" min="1" max="365" step="1" placeholder="Sin plazo definido" value={terms} onChange={e=>setTerms(e.target.value)}/></label>}
     {draftBalance<0&&<p className="ops-error">Los pagos no pueden superar el total de la compra.</p>}
     <div className="ops-receipt-picker">
      <label className="ops-photo-label">📷 {evidence?evidence.name:"Foto del ticket (opcional)"}<input aria-label="Fotografía del ticket" type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" onChange={e=>setEvidence(e.target.files?.[0]??null)}/></label>
      <label className="ops-inline-check"><input type="checkbox" checked={receiptDeliveredAtPurchase} onChange={e=>setReceiptDeliveredAtPurchase(e.target.checked)}/> Ya entregué el comprobante</label>
     </div>
     <details className="ops-purchase-extra"><summary>Observaciones (opcional)</summary><label>Observaciones<textarea rows={2} placeholder="Comentarios de la compra" value={notes} onChange={e=>setNotes(e.target.value)}/></label></details>
     <button className="ops-primary" disabled={busy||!supplierId||!Number.isFinite(draftBalance)||draftBalance<0||draftCents<1||tenders.some(p=>!p.amount.trim())} onClick={()=>void work(addPurchase)}>{busy?'Guardando…':'Guardar compra'}</button>
    </section>
    {recentSaved&&<p role="status" className="ops-saved-notice">{recentSaved}</p>}
    <section className="ops-purchase-search">
      <button className="ops-search-toggle" type="button" onClick={()=>{setHistoryOpen(v=>!v);setHistoryLoaded(false);}}>
        <span>Consultar compras anteriores</span><span aria-hidden="true">{historyOpen?'−':'+'}</span>
      </button>
      {historyOpen&&<div className="ops-search-body">
        <div className="ops-grid-2">
          <label>Desde<input type="date" value={queryFrom} onChange={e=>{setQueryFrom(e.target.value);setHistoryLoaded(false);}}/></label>
          <label>Hasta<input type="date" value={queryTo} onChange={e=>{setQueryTo(e.target.value);setHistoryLoaded(false);}}/></label>
        </div>
        <button disabled={busy} onClick={()=>void work(consultHistory)}>Consultar periodo</button>
        {historyLoaded&&<><p className="ops-hint">{matchedRows.length} compra(s) en el periodo seleccionado</p>
          <div className="ops-list">{matchedRows.map(p=><button key={p.id} className="ops-purchase" onClick={()=>{openPurchaseEdit(p);}}>
            <span><strong>{p.supplierName}</strong><small>{p.purchaseDate}</small></span>
            <span className="ops-purchase-amount"><strong>{cash(p.totalCents)}</strong><small>{p.cancelled?'Cancelada':status(p.goodsStatus)}</small></span>
          </button>)}</div>
          {editingPurchase&&active.purchases.filter(p=>p.id===editingPurchase).map(p=><section key={p.id} className="ops-inline-editor ops-purchase-editor">
            <div className="ops-section-title"><h3>Editar compra · {p.supplierName}</h3><button type="button" onClick={()=>setEditingPurchase('')}>Cerrar</button></div>
            {p.cancelled?<p>Compra cancelada: registro de solo lectura.</p>:<>
            <label>Proveedor<select value={editSupplier} onChange={e=>setEditSupplier(e.target.value)}>{active.suppliers.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            <div className="ops-grid-2"><label>Fecha<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}/></label><label>Total (CAD)<input inputMode="decimal" value={editTotal} onChange={e=>setEditTotal(e.target.value)}/></label></div>
            <label>Observaciones<textarea rows={2} value={editNotes} onChange={e=>setEditNotes(e.target.value)} maxLength={600}/></label>
            <p className="ops-hint">Si la compra ya tiene pagos, comprobantes o recepciones, no podrán modificarse el proveedor ni el importe. Las correcciones quedan auditadas.</p>
            <div className="ops-catalog-actions"><button type="button" disabled={busy} onClick={()=>void work(savePurchaseEdit)}>Guardar cambios</button><button type="button" disabled={busy} onClick={()=>void work(()=>cancelPurchase(p))}>Cancelar compra</button></div>
            </>}
           </section>)}
          {matchedRows.length===0&&<p className="ops-hint">No se encontraron compras en este periodo.</p>}
        </>}
      </div>}
    </section>
   </div>}
   {tab==='recepcion'&&<div className="ops-layout">
    <section className="ops-card">
     <h2>Recibir mercancía</h2><p className="ops-hint">Selecciona la compra, agrega los productos que llegaron y confirma la entrada física. No hay conexión automática con las recetas de Producción.</p>
     <label>Compra pendiente de recepción<select value={selected?.id??''} onChange={e=>{setSelection(e.target.value);setLineCost('');}}>
      <option value="">Selecciona la compra</option>{active.purchases.map(p=><option key={p.id} value={p.id}>{p.purchaseDate} · {p.supplierName} · {cash(p.totalCents)}</option>)}</select></label>
     {selected&&<div className="ops-receive-context"><strong>{selected.supplierName}</strong><span>Total de compra: {cash(selected.totalCents)}</span><span>Comprobante: {status(selected.documentStatus)}</span></div>}
     <div className="ops-divider"/>
     <div className="ops-section-title"><h3>1 · Producto maestro</h3><button type="button" onClick={()=>setInlineNewProduct(!inlineNewProduct)}>{inlineNewProduct?'Cancelar':'+ Crear producto maestro'}</button></div>
     <label>Producto maestro<select value={receivingProduct} onChange={e=>{const id=e.target.value;setReceivingProduct(id);setPresentationProduct(id);setReceivingPresentation('');const p=active.products.find(x=>x.id===id);if(p)setPackUnit(p.unit);}}>
      <option value="">Selecciona el ingrediente o artículo</option>{active.products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label>
     <p className="ops-hint">Busca primero el producto maestro. Un mismo queso feta conserva su identidad aunque cambie el proveedor, la bolsa o el precio.</p>
     {inlineNewProduct&&<div className="ops-inline-editor">
      <h3>Crear un nuevo producto maestro</h3>
      <p className="ops-hint">Úsalo únicamente si el producto base no existe. Para diferentes tamaños o empaques utiliza <strong>+ Nueva presentación</strong>; el proveedor y el precio se conservan en la compra.</p>
      <label>Nombre del producto base<input value={newProduct} onChange={e=>setNewProduct(e.target.value)} placeholder="Ej. Queso feta"/></label>
      <label>Unidad de control<select value={productUnit} onChange={e=>setProductUnit(e.target.value as 'kg'|'l'|'unit')}><option value="kg">Masa (kg)</option><option value="l">Volumen (L)</option><option value="unit">Piezas</option></select></label>
      {alreadyExists&&<p className="ops-duplicate-hint">Ya existe <strong>{alreadyExists.name}</strong> en esta empresa. Selecciónalo en lugar de duplicarlo.</p>}
      <button type="button" disabled={busy||newProduct.trim().length<2||Boolean(alreadyExists)} onClick={()=>void work(addProduct)}>Guardar producto maestro</button>
      {alreadyExists&&<button type="button" onClick={()=>{setReceivingProduct(alreadyExists.id);setPresentationProduct(alreadyExists.id);setReceivingPresentation('');setPackUnit(alreadyExists.unit);setInlineNewProduct(false);setNewProduct('');}}>Utilizar {alreadyExists.name}</button>}
     </div>}
     <div className="ops-divider"/>
     <div className="ops-section-title"><h3>2 · Presentación</h3><button type="button" disabled={!receivingProductObj} onClick={()=>{setPresentationProduct(receivingProduct);if(receivingProductObj)setPackUnit(receivingProductObj.unit);setInlineNewPresentation(!inlineNewPresentation);}}>{inlineNewPresentation?'Cancelar':'+ Nueva presentación'}</button></div>
     <label>Presentación comercial<select value={receivingPresentation} onChange={e=>setReceivingPresentation(e.target.value)} disabled={!receivingProduct}>
      <option value="">Seleccionar presentación</option>{receivingPresentations.map(p=><option key={p.id} value={p.id}>{p.label} · {p.unitAmount} {p.unit}</option>)}</select></label>
     {inlineNewPresentation&&receivingProductObj&&<div className="ops-inline-editor">
      <h3>Agregar presentación a {receivingProductObj.name}</h3>
      <label>Descripción<input placeholder="Ej. Bolsa 750 g" value={newPresentationLabel} onChange={e=>setNewPresentationLabel(e.target.value)}/></label>
      <div className="ops-grid-2"><label>Contenido por paquete<input type="number" step="any" min="0.001" value={packCount} onChange={e=>setPackCount(e.target.value)}/></label>
       <label>Unidad<select value={packUnit} onChange={e=>setPackUnit(e.target.value as OpsUnit)}>{PC_UNITS.map(u=>u.id).filter(u=>normalUnit(u)===receivingProductObj.unit).map(u=><option key={u} value={u}>{uLabel[u]}</option>)}</select></label></div>
      <button type="button" disabled={busy||!newPresentationLabel.trim()} onClick={()=>void work(addPresentation)}>Guardar y utilizar presentación</button>
     </div>}
     <div className="ops-divider"/>
     <h3>3 · Cantidad y costo del artículo</h3>
     <div className="ops-grid-2 ops-receive-amount-row"><label>Paquetes recibidos<input type="number" min="0.001" step="any" inputMode="decimal" value={receivedPacks} onChange={e=>setReceivedPacks(e.target.value)}/></label>
      <label>Importe del artículo antes de impuestos (CAD)<input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Opcional" value={lineCost} onChange={e=>setLineCost(e.target.value)}/></label></div>
     {currentPresentation&&<div className="ops-measure"><span>Cantidad equivalente recibida</span><strong>{Number.isFinite(Number(receivedPacks)*currentPresentation.unitAmount)?(Number(receivedPacks)*currentPresentation.unitAmount).toLocaleString('es-CA',{maximumFractionDigits:6}):'—'} {currentPresentation.unit}</strong>
      <small>{receivedPacks||0} paquete(s) de {currentPresentation.label}</small></div>}
     <label>¿La entrega de esta compra está completa?<select value={receptionState} onChange={e=>setReceptionState(e.target.value as 'partial'|'received')}><option value="partial">Todavía faltan artículos</option><option value="received">Sí, mercancía completa</option></select></label>
     <button className="ops-primary" disabled={busy||!selected||!currentPresentation||Number(receivedPacks)<=0} onClick={()=>void work(addReceipt)}>+ Agregar producto recibido</button>
    </section>
    <section className="ops-card">
     <h2>Entrada por compra</h2>
     {selected?<><p className="ops-hint">{selected.supplierName} · {selected.purchaseDate} · {cash(selected.totalCents)}</p>
      <div className="ops-mini-list">{active.receipts.filter(x=>x.purchaseId===selected.id).map(r=><div key={r.id}><span><strong>{r.productName}</strong><small>{r.packQuantity} × {r.presentationLabel}</small></span>
       <span>{r.receivedBaseAmount} {r.unit}{typeof r.lineTotalCents==='number'&&<small>{cash(r.lineTotalCents)} · costo registrado</small>}</span></div>)}</div>
      {!active.receipts.some(x=>x.purchaseId===selected.id)&&<p className="ops-hint">Todavía no se han registrado productos de esta compra. Utiliza el formulario de la izquierda.</p>}
      <div className="ops-divider"/>
      <h3>Confirmaciones de recepción</h3>
      <label className="ops-inline-check"><input type="checkbox" checked={selected.goodsStatus==='verified'} disabled={busy||selected.goodsStatus==='verified'||selected.goodsStatus!=='received'||selected.receiptCount<1} onChange={e=>{if(e.target.checked)void work(verifyGoods);}}/> Mercancía entregada y recibida correctamente</label>
      <label className="ops-inline-check"><input type="checkbox" checked={selected.receiptAcknowledged===true||selected.documentStatus==='received'} disabled={busy||selected.documentStatus==='received'||selected.documentStatus!=='delivered'} onChange={e=>{if(e.target.checked)void work(()=>changeDocument('received',selected));}}/> Comprobante original recibido</label>
      <p className="ops-hint">Para confirmar mercancía se requiere al menos una línea recibida y la entrega marcada como completa. El acuse de comprobante requiere que Compras lo haya marcado entregado.</p>
      <div className="ops-status-line"><span>Mercancía: {status(selected.goodsStatus)}</span><span>Comprobante: {status(selected.documentStatus)}</span></div>
     </>:<p>Selecciona una compra para capturar su mercancía.</p>}
    </section>
   </div>}
   {tab==='conciliacion'&&<section className="ops-card ops-reconcile">
     <h2>Seguimiento y conciliación de compras</h2>
     <p className="ops-hint">Consulta las compras del periodo seleccionado y verifica sus etapas. Las marcas reflejan registros reales de cada proceso; no sustituyen la validación bancaria.</p>
     <div className="ops-date-query">
      <label>Desde<input type="date" value={queryFrom} onChange={e=>{setQueryFrom(e.target.value);setHistoryLoaded(false);}}/></label>
      <label>Hasta<input type="date" value={queryTo} onChange={e=>{setQueryTo(e.target.value);setHistoryLoaded(false);}}/></label>
      <button type="button" className="ops-primary" disabled={busy||!queryFrom||!queryTo||queryFrom>queryTo} onClick={()=>void work(consultHistory)}>{busy?'Consultando…':'Consultar'}</button>
     </div>
     {historyLoaded?<div className="ops-history-result">
      <div className="ops-section-title"><h3>Compras del {queryFrom} al {queryTo}</h3><span className="ops-count">{matchedRows.length}</span></div>
      {matchedRows.length>0&&<div className="ops-history-scroll"><table className="ops-history-table">
       <thead><tr><th>Fecha / proveedor</th><th>Total</th><th>Ticket entregado</th><th>Mercancía recibida</th><th>Ticket recibido</th><th>Banco conciliado</th><th>Seguimiento</th></tr></thead>
       <tbody>{matchedRows.map(p=><tr key={p.id}>
        <td data-label="Compra"><strong>{p.supplierName}</strong><small>{p.purchaseDate} · {p.id.slice(0,12)}</small></td>
        <td data-label="Total"><strong>{cash(p.totalCents)}</strong>{p.balanceCents>0&&<small>Saldo {cash(p.balanceCents)}</small>}</td>
        <td data-label="Ticket entregado"><input type="checkbox" disabled readOnly checked={p.receiptDelivered===true||['delivered','received'].includes(p.documentStatus)} aria-label="Ticket entregado" title="Se marca al registrar la entrega del ticket"/></td>
        <td data-label="Mercancía recibida"><input type="checkbox" disabled readOnly checked={['received','verified'].includes(p.goodsStatus)} aria-label="Mercancía recibida" title="Según la recepción física registrada"/></td>
        <td data-label="Ticket recibido"><input type="checkbox" disabled readOnly checked={p.receiptAcknowledged===true||p.documentStatus==='received'} aria-label="Ticket recibido" title="Acuse del responsable de recepción"/></td>
        <td data-label="Banco conciliado">{bankLabel(p)==='Crédito sin pago'||bankLabel(p)==='Sin cargo bancario'?<span className="ops-not-applicable">{bankLabel(p)}</span>:
         <label className="ops-bank-cell"><input type="checkbox" disabled readOnly checked={bankVerified(p)} aria-label="Transacción bancaria conciliada" title="Solo una conciliación verificada con el statement podrá completar esta etapa"/><small>{bankVerified(p)?'Conciliado':'Pendiente'}</small></label>}</td>
        <td data-label="Detalle"><button className="ops-row-action" type="button" onClick={()=>setSelection(p.id)}>Detalle</button></td>
       </tr>)}</tbody>
      </table></div>}
      {matchedRows.length===0&&<p className="ops-hint">No hay compras en este periodo. Prueba otras fechas.</p>}
      <p className="ops-hint">Los checkboxes son indicadores de estado, no controles para inventar una entrega o una conciliación. Los movimientos bancarios sin compra respaldada se identificarán al implementar la importación del statement.</p>
     </div>:<div className="ops-awaiting-query"><strong>Consulta por periodo</strong><p>Elige las fechas y pulsa Consultar. No se carga un historial indefinido automáticamente.</p></div>}
     {historyLoaded&&selected&&matchedRows.some(p=>p.id===selected.id)&&<div className="ops-transaction-details">
      <div className="ops-section-title"><h3>Detalle · {selected.supplierName}</h3><button onClick={()=>setSelection('')}>Cerrar</button></div>
      <div className="ops-payment-summary">
       <div><span>Importe comprado</span><strong>{cash(selected.totalCents)}</strong></div>
       <div><span>Pagos registrados</span><strong>{cash(selected.paidCents)}</strong></div>
       <div><span>Saldo por pagar</span><strong>{cash(selected.balanceCents)}</strong></div>
      </div>
      <h3>Registrar abono de una compra a crédito</h3>
      <div className="ops-grid-2">
       <label>Importe del abono (CAD)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={payAmount} onChange={e=>setPayAmount(e.target.value)}/></label>
       <label>Medio de pago<select value={payMethod} onChange={e=>setPayMethod(e.target.value as OpsPayment['method'])}>{tenderMethods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      </div>
      <button disabled={busy||selected.balanceCents<=0} onClick={()=>void work(addPayment)}>Aplicar abono</button>
      <p className="ops-hint">Registrar el abono disminuye la deuda. No marca automáticamente el movimiento como conciliado en el banco.</p>
     </div>}
    </section>}
   {tab==='catalogos'&&<div className="ops-layout">
    <section className="ops-card"><h2>Proveedores y productos maestros</h2>
     <label>Nuevo proveedor<input value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} placeholder="Nombre comercial"/></label>
     <button disabled={busy||newSupplier.trim().length<2} onClick={()=>void work(addSupplier)}>+ Agregar proveedor</button>
     <div className="ops-divider"/>
     <label>{editingProduct?'Editar producto maestro':'Nuevo producto maestro'}<input value={newProduct} onChange={e=>setNewProduct(e.target.value)} placeholder="Ej. Queso feta"/></label>
     <label>Unidad base<select value={productUnit} onChange={e=>setProductUnit(e.target.value as 'kg'|'l'|'unit')}>
      <option value="kg">Kilogramos (masa)</option><option value="l">Litros (volumen)</option><option value="unit">Piezas (conteo)</option></select></label>
     {alreadyExists&&<p className="ops-duplicate-hint">Este producto maestro ya existe: {alreadyExists.name}. Selecciónalo en la lista de presentaciones.</p>}
     <button disabled={busy||newProduct.trim().length<2||Boolean(alreadyExists)} onClick={()=>void work(editingProduct?saveProductEdit:addProduct)}>{editingProduct?'Guardar cambios':'+ Crear producto maestro'}</button>
     {editingProduct&&<button type="button" onClick={()=>{setEditingProduct(null);setNewProduct('');}}>Cancelar edición</button>}
     <div className="ops-divider"/><h3>Productos existentes</h3>
     <input aria-label="Buscar producto maestro" placeholder="Buscar producto..." value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)}/>
     <div className="ops-mini-list ops-catalog-products">{active.products.filter(p=>nameKey(p.name).includes(nameKey(catalogSearch))).map(p=><div key={p.id}><span><strong>{p.name}</strong><small>{p.unit} · {p.active?'Activo':'Inactivo'}</small></span><span className="ops-catalog-actions"><button type="button" disabled={busy} onClick={()=>{setEditingProduct(p.id);setNewProduct(p.name);setProductUnit(p.unit);}}>Editar</button>{p.active&&<button type="button" disabled={busy} onClick={()=>void work(()=>removeProduct(p.id,'deactivate'))}>Desactivar</button>}<button type="button" disabled={busy} onClick={()=>void work(()=>removeProduct(p.id,'delete'))}>Eliminar</button></span></div>)}</div>
    </section>
    <section className="ops-card"><h2>Presentaciones por producto</h2>
     <label>Producto maestro<select value={presentationProduct} onChange={e=>{setPresentationProduct(e.target.value);const p=active.products.find(x=>x.id===e.target.value);if(p)setPackUnit(p.unit);}}>
      <option value="">Selecciona producto</option>{active.products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <div className="ops-mini-list ops-catalog-products">{active.presentations.filter(p=>p.productId===presentationProduct).map(p=><div key={p.id}><span><strong>{p.label}</strong><small>{p.packCount} {uLabel[p.packUnit]} = {p.unitAmount} {p.unit} · {p.active?'Activa':'Inactiva'}</small></span><span className="ops-catalog-actions"><button type="button" disabled={busy} onClick={()=>{setEditingPresentation(p.id);setNewPresentationLabel(p.label);setPackCount(String(p.packCount));setPackUnit(p.packUnit);}}>Editar</button>{p.active&&<button type="button" disabled={busy} onClick={()=>void work(()=>removePresentation(p,'deactivate'))}>Desactivar</button>}<button type="button" disabled={busy} onClick={()=>void work(()=>removePresentation(p,'delete'))}>Eliminar</button></span></div>)}</div>
     <div className="ops-divider"/>
     <h3>{editingPresentation?'Editar equivalencia':'Crear presentación o equivalencia'}</h3>
     <label>Nombre de presentación<input value={newPresentationLabel} onChange={e=>setNewPresentationLabel(e.target.value)} placeholder="Ej. Bolsa de 750 g"/></label>
     <div className="ops-grid-2"><label>Contenido del paquete<input type="number" min="0.001" step="any" value={packCount} onChange={e=>setPackCount(e.target.value)}/></label>
      <label>Unidad<select value={packUnit} onChange={e=>setPackUnit(e.target.value as OpsUnit)}>
       {eligibleUnits.map(u=><option key={u} value={u}>{uLabel[u]}</option>)}</select></label></div>
     <button disabled={busy||!presentationProduct||!newPresentationLabel.trim()||!(Number(packCount)>0)} onClick={()=>void work(addPresentation)}>{editingPresentation?'Guardar cambios':'+ Guardar presentación'}</button>{editingPresentation&&<button type="button" onClick={()=>{setEditingPresentation(null);setNewPresentationLabel('');setPackCount('');}}>Cancelar edición</button>}
     <p className="ops-hint">Las equivalencias físicas (kg, g, lb, L, mL, piezas) son fijas. Las presentaciones se pueden crear, editar o desactivar por producto. Una equivalencia ya utilizada en una recepción no puede modificarse ni eliminarse.</p>
    </section>
   </div>}
   {(tab==='kpis'||(tab==='showroom'&&showroomVisible))&&<section className="ops-card">
     <div className="ops-section-title"><h2>{tab==='showroom'?'Showroom · datos sintéticos':'KPIs de Compras y Recepción'}</h2>
     <span className="ops-caption">{tab==='showroom'?'Ejemplo ilustrativo; no muestra clientes reales':(demoMode?'Solo datos creados durante esta sesión':'Datos autorizados de Firestore')}</span></div>
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
     <p className="ops-hint">{tab==='showroom'?'Vista sintética exclusiva de Superadmin. Se publicará por separado cuando exista su aplicación y su contrato de acceso.':'Los porcentajes y montos agregados se calculan únicamente sobre las empresas seleccionadas y autorizadas. No representan inventario de recetas.'}</p>
    </section>}
   {tab==='datos'&&!demoMode&&superadminVerified&&user&&<section className="ops-card">
    <h2>Exportación para Data Warehouse · Superadmin</h2>
    <p className="ops-hint">Acceso exclusivo de superadministración; el servidor vuelve a comprobar identidad, rol activo y autorización para esta empresa en cada solicitud. No hay exportaciones de otras empresas ni datos sintéticos.</p>
    <div className="ops-grid-2">{['ops_purchases','ops_payments','ops_suppliers','ops_products','ops_presentations','ops_receipts','ops_documents','ops_audit'].map(x=>
      <div className="ops-table-name" key={x}><code>{x}</code></div>)}</div>
    <button className="ops-primary" disabled={busy} onClick={()=>void work(downloadProtectedPurchases)}>Descargar compras de {site.toUpperCase()} (CSV autorizado)</button>
    <p className="ops-hint">La exportación corresponde únicamente a la empresa seleccionada. Las tablas y el contrato incremental para RAW → CORE → MART aún requieren certificación del dominio Procesos.</p>
   </section>}
   {tab==='kpis'&&<section className="ops-card"><h3>Alcance del reporte</h3>
    <div className="ops-scope">{SITES.map(s=><label key={s.id}><input type="checkbox" checked={scope.includes(s.id)} onChange={e=>setScope(curr=>e.target.checked?[...curr,s.id]:curr.filter(x=>x!==s.id))}/>{s.name}</label>)}</div>
    {!demoMode&&<p className="ops-hint">Para consultar varias empresas, selecciónalas y pulsa «Consultar empresas seleccionadas». El backend denegará cualquier empresa que no esté incluida en tus permisos.</p>}
   </section>}
   <footer className="ops-footer">Business Transformation · Vista de prueba · Producción y Conteo sin cambios</footer>
  </main>
 </div>;
}
