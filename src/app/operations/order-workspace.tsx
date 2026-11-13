'use client';
import {useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {baseAmount,normalUnit,type OpsSnapshot,type OpsSite,type OpsUnit} from '@/lib/ops-contract';
import {OPS_APPROVAL_AREAS,orderEstimate,effectiveBudgetRange,supplyStatusFor,
 type OpsCostReportRow,type OpsOrder,type OpsOrderLine,type OpsApprovalArea} from '@/lib/ops-order-contract';
import {PC_UNITS} from '@/lib/pc-units';

type Panel='ordenes'|'planeacion'|'costos'|'proveedores';
type Props={panel:Panel;site:OpsSite;data:OpsSnapshot;demo:boolean;user:User|null;workspace:'admin'|'compras'|'control'};
type LedgerRow={supplierId:string;supplierName:string;balanceCents:number;invoices:number;totalPaidToSupplierCents:number};
const money=(c:number|null|undefined)=>c===null||c===undefined?'Sin costo histórico':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(c/100);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const past=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return d.toLocaleDateString('en-CA',{timeZone:'America/Toronto'});};
const labels:{[key:string]:string}={draft:'Borrador',pending_owner:'Pendiente propietaria',returned:'Devuelta para corrección',approved:'Abierta / autorizada',closed:'Cerrada',pending:'Pendiente',partial:'Parcial',complete:'Completo'};
function demoOrder(site:OpsSite,lines:OpsOrderLine[],from:string,to:string,budget:number,min:number,max:number,actor:string):OpsOrder{
 return {id:site+'_'+crypto.randomUUID(),siteId:site,folio:site.toUpperCase()+'-OC-'+today().replaceAll('-','')+'-DEMO',
  status:'draft',revision:1,from,to,lines,estimatedSubtotalCents:orderEstimate(lines),
  requestedBudgetCents:budget,minPercent:min,maxPercent:max,...effectiveBudgetRange(budget,min,max),
  approvals:{},createdBy:actor};
}
export default function OrderWorkspace({panel,site,data,demo,user,workspace}:Props){
 const [orders,setOrders]=useState<OpsOrder[]>([]),[costs,setCosts]=useState<OpsCostReportRow[]>([]);
 const [accounts,setAccounts]=useState<LedgerRow[]>([]);
 const [from,setFrom]=useState(past(30)),[to,setTo]=useState(today());
 const [demoHydrated,setDemoHydrated]=useState(false);
 const [previewDisabled,setPreviewDisabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [name,setName]=useState(''),[pId,setPId]=useState(''),[unit,setUnit]=useState<OpsUnit>('kg'),[quantity,setQuantity]=useState('');
 const [lines,setLines]=useState<OpsOrderLine[]>([]),[budget,setBudget]=useState(''),[minPct,setMinPct]=useState('90'),[maxPct,setMaxPct]=useState('120');
 const [revisionId,setRevisionId]=useState('');
 const [comment,setComment]=useState(''),[paidSupplier,setPaidSupplier]=useState(''),[paidAmount,setPaidAmount]=useState(''),[paidRef,setPaidRef]=useState(''),[paidMethod,setPaidMethod]=useState('transfer');
 const [supplies,setSupplies]=useState<Record<string,string>>({});
 const [demoProducts,setDemoProducts]=useState<{id:string;name:string;unit:'kg'|'l'|'unit'}[]>([]),[newDemoProduct,setNewDemoProduct]=useState('');
 const demoOnly=demo||previewDisabled;
 const allProducts=useMemo(()=>[
   ...data.products.filter(x=>x.siteId===site&&x.active).map(x=>({id:x.id,name:x.name,unit:x.unit})),
   ...(demoOnly?demoProducts:[])
 ],[data.products,site,demoProducts,demoOnly]);
 const selectedProduct=allProducts.find(x=>x.id===pId);
 const allowedUnits=PC_UNITS.map(x=>x.id).filter(x=>selectedProduct&&normalUnit(x)===selectedProduct.unit);
 const selectedAvg=costs.find(x=>x.productId===pId)?.avgCostCents??null;
 const estimateSubtotal=orderEstimate(lines);
 const budgetCents=Math.round(Number(budget)*100);
 const minimum=Number(minPct),maximum=Number(maxPct);
 const budgetBounds=Number.isFinite(budgetCents)&&Number.isFinite(minimum)&&Number.isFinite(maximum)?
   effectiveBudgetRange(budgetCents,minimum,maximum):null;
 const draftOrders=orders.filter(o=>['draft','returned','pending_owner'].includes(o.status));
 const activeOrders=orders.filter(o=>o.status==='approved');
 const closedOrders=orders.filter(o=>o.status==='closed');
 const ownerOnly=workspace==='admin'&&Boolean(user);

 async function get(path:string){
  const response=await fetch(path,{cache:'no-store'});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new Error(String(result.error||'Error de consulta'));
  return result;
 }
 async function fetchAll(){
  if(demoOnly)return;
  const [o,a]=await Promise.all([
   get('/api/operations/orders?view=orders&site='+site),
   get('/api/operations/suppliers?site='+site)
  ]);
  setOrders(o.orders as OpsOrder[]??[]);
  setAccounts(a.rows as LedgerRow[]??[]);
 }
 useEffect(()=>{
  if(!demoOnly)return;
  let active=true;
  Promise.resolve().then(()=>{
   if(!active)return;
   try{
    const raw=sessionStorage.getItem('ops:orders:demo:'+site);
    if(raw){const parsed=JSON.parse(raw) as {orders?:OpsOrder[];demoProducts?:{id:string;name:string;unit:'kg'|'l'|'unit'}[]};
      if(Array.isArray(parsed.orders))setOrders(parsed.orders);
      if(Array.isArray(parsed.demoProducts))setDemoProducts(parsed.demoProducts);
    }
   }catch{}
   setDemoHydrated(true);
  });
  return ()=>{active=false;};
 },[demoOnly,site]);
 useEffect(()=>{
  if(!demoOnly||!demoHydrated)return;
  sessionStorage.setItem('ops:orders:demo:'+site,JSON.stringify({orders,demoProducts}));
 },[demoOnly,demoHydrated,site,orders,demoProducts]);
 useEffect(()=>{
  if(demo)return;
  let valid=true;
  (async()=>{try{
   const r=await get('/api/operations/orders?view=orders&site='+site);
   if(!valid)return;setOrders(r.orders as OpsOrder[]??[]);setPreviewDisabled(false);setError('');
  }catch(e){if(!valid)return;const message=e instanceof Error?e.message:String(e);
   if(message==='OPS_PREVIEW_DISABLED'){setPreviewDisabled(true);setError('');}
   else setError(message);
  }})();
  return ()=>{valid=false;};
 },[site,demo]);
 useEffect(()=>{
  if(demoOnly)return;
  let valid=true;
  (async()=>{try{
   const r=await get('/api/operations/orders?view=costs&site='+site+'&from='+from+'&to='+to);
   if(valid)setCosts((r.rows as OpsCostReportRow[])??[]);
  }catch(e){if(valid)setError(e instanceof Error?e.message:String(e));}})();
  return ()=>{valid=false;};
 },[site,from,to,demoOnly]);
 useEffect(()=>{
  if(demoOnly||panel!=='proveedores')return;
  let valid=true;
  get('/api/operations/suppliers?site='+site).then(r=>{if(valid)setAccounts(r.rows as LedgerRow[]??[]);})
    .catch(e=>{if(valid)setError(e instanceof Error?e.message:String(e));});
  return ()=>{valid=false;};
 },[site,panel,demoOnly]);

 async function call(action:string,payload:Record<string,unknown>,endpoint='/api/operations/orders',owner=false){
  const token=owner&&user?await user.getIdToken():'';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify({siteId:site,action,actor:name,...payload})});
  const answer=await r.json() as {error?:string;ok?:boolean;id?:string;folio?:string};
  if(!r.ok)throw new Error(answer.error||'Error al guardar');
  return answer;
 }
 async function act(fn:()=>Promise<void>){
  setBusy(true);setError('');setNotice('');
  try{await fn();setNotice('Cambios guardados correctamente.');}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function setPeriod(value:string){
  const days=Number(value);setFrom(past(days));setTo(today());
 }
 function addLine(){
  if(!selectedProduct||!allowedUnits.includes(unit)||!(Number(quantity)>0))throw new Error('Elige producto, unidad y cantidad.');
  if(lines.some(x=>x.productId===pId))throw new Error('Este producto ya está en la orden.');
  const base=baseAmount(Number(quantity),unit);
  setLines(l=>[...l,{id:crypto.randomUUID(),productId:pId,productName:selectedProduct.name,
   unit,quantity:Number(quantity),requestedBaseAmount:base,unitCostCents:selectedAvg,
   estimateCents:selectedAvg===null?null:Math.round(base*selectedAvg),suppliedBaseAmount:0,supplyStatus:'pending'}]);
  setPId('');setQuantity('');
 }
 async function saveOrder(){
  if(!lines.length||!Number.isSafeInteger(budgetCents)||budgetCents<1||!Number.isFinite(minimum)||!Number.isFinite(maximum)||
    minimum<0||minimum>100||maximum<100||maximum>300)throw new Error('Captura productos y presupuesto con márgenes válidos.');
  if(demoOnly){
   if(revisionId){
    setOrders(o=>o.map(x=>x.id===revisionId?{...demoOrder(site,lines,from,to,budgetCents,minimum,maximum,name),
     id:x.id,folio:x.folio,revision:x.revision+1}:x));
   }else setOrders(o=>[demoOrder(site,lines,from,to,budgetCents,minimum,maximum,name),...o]);
  }else{
   await call(revisionId?'order.revise':'order.create',{...(revisionId?{orderId:revisionId}:{}),
    from,to,lines:lines.map(x=>({productId:x.productId,quantity:x.quantity,unit:x.unit})),
    requestedBudgetCents:budgetCents,minPercent:minimum,maxPercent:maximum});
   await fetchAll();
  }
  setRevisionId('');setLines([]);setBudget('');
 }
 async function approveArea(order:OpsOrder,role:OpsApprovalArea){
  if(name.trim().length<2)throw new Error('Captura el nombre de quien valida.');
  if(demoOnly){
   setOrders(list=>list.map(x=>x.id===order.id?{...x,approvals:{...x.approvals,
    [role]:{name:name.trim(),revision:x.revision,at:new Date().toISOString()}}}:x));
  }else{await call('order.approval',{orderId:order.id,role});await fetchAll();}
 }
 async function submit(order:OpsOrder){
  if(!OPS_APPROVAL_AREAS.every(role=>order.approvals[role]?.revision===order.revision))throw new Error('Faltan validaciones.');
  if(demoOnly)setOrders(list=>list.map(x=>x.id===order.id?{...x,status:'pending_owner'}:x));
  else {await call('order.submit',{orderId:order.id});await fetchAll();}
 }
 async function ownerDecision(order:OpsOrder,decision:'approve'|'return'){
  if(!demoOnly&&!ownerOnly)throw new Error('Aprobación reservada a Superadmin.');
  if(decision==='return'&&comment.trim().length<3)throw new Error('Escribe el comentario de devolución.');
  if(demoOnly)setOrders(list=>list.map(x=>x.id===order.id?{...x,status:decision==='approve'?'approved':'returned',
   ownerComment:comment,approvals:decision==='return'?{}:x.approvals}:x));
  else{await call('order.owner',{orderId:order.id,decision,comment},'/api/operations/orders',true);await fetchAll();}
  setComment('');
 }
 function edit(order:OpsOrder){
  setRevisionId(order.id);setLines(order.lines.map(x=>({...x,id:crypto.randomUUID(),suppliedBaseAmount:0,supplyStatus:'pending'})));
  setFrom(order.from);setTo(order.to);setBudget((order.requestedBudgetCents/100).toFixed(2));
  setMinPct(String(order.minPercent));setMaxPct(String(order.maxPercent));
  setNotice('Edición de '+order.folio+': guarda la propuesta para reiniciar las validaciones.');
 }
 async function markSupply(order:OpsOrder,line:OpsOrderLine,amount:number){
  if(amount<0||amount>line.quantity)throw new Error('La cantidad no puede superar lo solicitado.');
  const suppliedBaseAmount=amount<=0?0:baseAmount(amount,line.unit);
  if(demoOnly)setOrders(items=>items.map(o=>o.id===order.id?{...o,lines:o.lines.map(l=>l.id===line.id?{...l,
   suppliedBaseAmount,supplyStatus:supplyStatusFor(l.requestedBaseAmount,suppliedBaseAmount)}:l)}:o));
  else{await call('order.supply',{orderId:order.id,lineId:line.id,suppliedBaseAmount});await fetchAll();}
 }
 async function close(order:OpsOrder){
  const reason=window.prompt('¿Por qué das por atendida esta orden? (incluye faltantes si los hay)');
  if(reason===null)return;
  if(reason.trim().length<5)throw new Error('El motivo debe tener al menos cinco caracteres.');
  if(!window.confirm('Cerrar '+order.folio+' y retirarla de órdenes abiertas?'))return;
  if(demoOnly)setOrders(list=>list.map(x=>x.id===order.id?{...x,status:'closed',closeReason:reason,
    closeResult:x.lines.every(l=>l.supplyStatus==='complete')?'complete':'with_pending'}:x));
  else{await call('order.close',{orderId:order.id,reason});await fetchAll();}
 }
 async function paySupplier(){
  const amountCents=Math.round(Number(paidAmount)*100);
  if(!paidSupplier||!(amountCents>0)||paidRef.trim().length<3)throw new Error('Selecciona proveedor, importe y referencia.');
  if(demoOnly)throw new Error('Los pagos reales solo están disponibles en producción, no en el Preview.');
  await call('supplier.pay',{supplierId:paidSupplier,amountCents,method:paidMethod,paidDate:today(),reference:paidRef},'/api/operations/suppliers');
  setPaidAmount('');setPaidRef('');await fetchAll();
 }
 return <section className="ops-module">
  {demoOnly&&<p className="ops-demo-note">Vista de demostración aislada · sin lecturas ni escrituras en Firebase productivo. Los registros de prueba existen solo en esta pantalla.</p>}
  {error&&<p className="ops-error" role="alert">{error}</p>}
  {notice&&<p className="ops-saved-notice" role="status">{notice}</p>}
  {panel==='costos'&&<div className="ops-card">
   <h2>Consumo comprado · Productos maestros</h2>
   <p className="ops-hint">Agrupación por producto maestro, independientemente del proveedor o presentación. Solo se promedian líneas con costo documentado; no se inventan precios.</p>
   <div className="ops-grid-2"><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
   <div className="ops-report-list">
    {costs.map(r=><div className="ops-report-row" key={r.productId}><strong>{r.productName}</strong>
     <span>{r.quantity.toLocaleString('es-CA',{maximumFractionDigits:4})} {r.unit} · {money(r.amountCents)} acumulados</span>
     <b>Promedio: {r.avgCostCents===null?'No disponible':money(r.avgCostCents)+'/'+r.unit}</b>
     {r.unpricedLines>0&&<small>{r.unpricedLines} línea(s) sin costo: promedio no certificable</small>}
    </div>)}
    {!costs.length&&<p className="ops-hint">No hay recepciones con información de costo para este periodo.</p>}
   </div>
  </div>}
  {panel==='planeacion'&&<>
   <div className="ops-card">
    <h2>{revisionId?'Corregir orden':'Preparar orden de compra'}</h2>
    <p className="ops-hint">Solicita productos manualmente; las cantidades no se calculan del inventario. El costo histórico solo orienta el presupuesto.</p>
    <label>Periodo de referencia<select onChange={e=>setPeriod(e.target.value)} defaultValue="30">
      <option value="15">Últimos 15 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option>
      <option value="365">Últimos 12 meses</option></select></label>
    <div className="ops-grid-2"><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
    {demoOnly&&allProducts.length===0&&<div className="ops-inline-editor">
      <label>Producto de demostración<input placeholder="Nombre de producto maestro" value={newDemoProduct} onChange={e=>setNewDemoProduct(e.target.value)}/></label>
      <button type="button" onClick={()=>{if(newDemoProduct.trim().length>1){setDemoProducts(p=>[...p,{id:'demo_'+crypto.randomUUID(),name:newDemoProduct.trim(),unit:'kg'}]);setNewDemoProduct('');}}}>Crear solo en memoria</button>
     </div>}
    <label>Producto maestro<select value={pId} onChange={e=>{setPId(e.target.value);const p=allProducts.find(x=>x.id===e.target.value);if(p)setUnit(p.unit);}}>
      <option value="">Seleccionar producto</option>{allProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="ops-grid-2"><label>Unidad<select value={unit} disabled={!pId} onChange={e=>setUnit(e.target.value as OpsUnit)}>
     {allowedUnits.map(u=><option key={u} value={u}>{PC_UNITS.find(x=>x.id===u)?.es??u}</option>)}</select></label>
     <label>Cantidad solicitada<input inputMode="decimal" type="number" min="0.001" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label></div>
    <p className="ops-hint">Precio medio por unidad base: {money(selectedAvg)}{selectedProduct?' / '+selectedProduct.unit:''}. {selectedAvg===null?'Sin datos de costo, requiere presupuesto manual.':''}</p>
    <button type="button" disabled={!pId||!(Number(quantity)>0)} onClick={()=>{try{addLine();}catch(e){setError(String(e));}}}>+ Agregar a la orden</button>
    <div className="ops-order-lines">{lines.map(line=><div key={line.id} className="ops-order-line">
      <span><strong>{line.productName}</strong><small>{line.quantity} {line.unit} · {money(line.estimateCents)}</small></span>
      <button type="button" onClick={()=>setLines(v=>v.filter(x=>x.id!==line.id))}>Quitar</button>
     </div>)}</div>
    <div className="ops-payment-summary"><div><span>Subtotal estimado</span><strong>{money(estimateSubtotal)}</strong></div></div>
    <label>Presupuesto solicitado (CAD)<input inputMode="decimal" type="number" min="0.01" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
    <h3>Margen autorizado sobre el presupuesto solicitado</h3>
    <div className="ops-grid-2 ops-budget-sliders">
     <label>Porcentaje mínimo: <strong>{minPct}%</strong>
      <input aria-label="Porcentaje mínimo autorizado" type="range" min="0" max="100" step="5" value={minPct} onChange={e=>setMinPct(e.target.value)}/>
      <strong>{money(budgetBounds?.minBudgetCents)}</strong>
     </label>
     <label>Porcentaje máximo: <strong>{maxPct}%</strong>
      <input aria-label="Porcentaje máximo autorizado" type="range" min="100" max="300" step="5" value={maxPct} onChange={e=>setMaxPct(e.target.value)}/>
      <strong>{money(budgetBounds?.maxBudgetCents)}</strong>
     </label>
    </div>
    <p className="ops-hint">Controles independientes: cada barra tiene su propia escala y no modifica la otra. Rango permitido: {money(budgetBounds?.minBudgetCents)} – {money(budgetBounds?.maxBudgetCents)}.</p>
    <label>Nombre del responsable que captura<input placeholder="Nombre" value={name} onChange={e=>setName(e.target.value)}/></label>
    <button className="ops-primary" disabled={busy||!lines.length||!(budgetCents>0)} onClick={()=>void act(saveOrder)}>{revisionId?'Guardar revisión':'Crear propuesta'}</button>
   </div>
   <div className="ops-card"><h2>Validaciones y autorización</h2>
    <p className="ops-hint">Las cuatro constancias internas requieren nombre del responsable. Como el personal no inicia sesión, su identidad aún no se verifica; la autorización final sí exige Superadmin.</p>
    <label>Responsable que valida<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre y apellido"/></label>
    {draftOrders.map(order=><div className="ops-order-card" key={order.id}>
      <div className="ops-section-title"><strong>{order.folio}</strong><span>{labels[order.status]}</span></div>
      <p className="ops-hint">{order.lines.length} productos · presupuesto {money(order.requestedBudgetCents)} · estimado {money(order.estimatedSubtotalCents)}</p>
      {order.ownerComment&&<p className="ops-hint">Comentario de propietaria: {order.ownerComment}</p>}
      {order.status!=='pending_owner'?<>
       <div className="ops-approval-grid">{OPS_APPROVAL_AREAS.map(role=><button key={role} type="button" disabled={busy||!name.trim()||Boolean(order.approvals[role])}
        onClick={()=>void act(()=>approveArea(order,role))}>{order.approvals[role]?'✓ ':'○ '}{role.toUpperCase()}{order.approvals[role]?': '+order.approvals[role]?.name:''}</button>)}</div>
       {order.status==='returned'&&<button type="button" onClick={()=>edit(order)}>Corregir y reenviar</button>}
       {order.status==='draft'&&<button type="button" disabled={busy||!OPS_APPROVAL_AREAS.every(role=>order.approvals[role]?.revision===order.revision)}
         onClick={()=>void act(()=>submit(order))}>Enviar a propietaria</button>}
      </>:<><p className="ops-hint">Esperando autorización final.</p>
       {workspace==='admin'&&<div className="ops-inline-editor">
        <label>Comentario de la propietaria<textarea rows={2} value={comment} onChange={e=>setComment(e.target.value)}/></label>
        <div className="ops-catalog-actions"><button disabled={busy||!ownerOnly&&!demoOnly} onClick={()=>void act(()=>ownerDecision(order,'approve'))}>Autorizar</button>
         <button disabled={busy||(!ownerOnly&&!demoOnly)||comment.trim().length<3} onClick={()=>void act(()=>ownerDecision(order,'return'))}>Devolver con observaciones</button></div>
       </div>}
      </>}
     </div>)}
    {!draftOrders.length&&<p className="ops-hint">Sin propuestas pendientes.</p>}
   </div>
  </>}
  {panel==='ordenes'&&<>
   <div className="ops-card"><h2>Órdenes de compra abiertas</h2>
    <p className="ops-hint">Solo las autorizadas por la propietaria. Puedes cerrar una orden con faltantes sin borrar su historial.</p>
    {activeOrders.map(order=><div key={order.id} className="ops-order-card">
     <div className="ops-section-title"><strong>{order.folio}</strong><span>{labels[order.status]}</span></div>
     <p className="ops-hint">Solicitado {money(order.requestedBudgetCents)} · rango {money(order.minBudgetCents)} a {money(order.maxBudgetCents)}</p>
     {order.lines.map(line=><div className="ops-supply-line" key={line.id}>
      <strong>{line.productName}</strong><small>{line.quantity} {line.unit} pedidos · {labels[line.supplyStatus]}</small>
      <div className="ops-supply-controls">
       <label>Abastecidos ({line.unit})<input type="number" min="0" max={line.quantity} step="any"
        value={supplies[line.id]??String(line.suppliedBaseAmount/(baseAmount(1,line.unit)))}
        onChange={e=>setSupplies(x=>({...x,[line.id]:e.target.value}))}/></label>
       <button type="button" disabled={busy} onClick={()=>void act(()=>markSupply(order,line,Number(supplies[line.id]??0)))}>Parcial / pendiente</button>
       <button type="button" disabled={busy||line.supplyStatus==='complete'} onClick={()=>void act(()=>markSupply(order,line,line.quantity))}>✓ Completo</button>
      </div>
     </div>)}
     <button className="ops-primary" disabled={busy} onClick={()=>void act(()=>close(order))}>Dar orden por atendida / cerrar</button>
    </div>)}
    {!activeOrders.length&&<p className="ops-hint">Sin órdenes abiertas. Las propuestas no autorizadas no se muestran aquí.</p>}
   </div>
   <details className="ops-card ops-order-history"><summary>Historial de órdenes cerradas ({closedOrders.length})</summary>
    {closedOrders.map(o=><div className="ops-order-line" key={o.id}><span><strong>{o.folio}</strong><small>{o.closeResult==='complete'?'Atendida completa':'Atendida con faltantes'} · {o.closeReason}</small></span></div>)}
   </details>
  </>}
  {panel==='proveedores'&&<div className="ops-card">
   <h2>Cuentas por pagar a proveedores</h2>
   <p className="ops-hint">Las notas de crédito originan saldo a cargo del proveedor, no un pago bancario. Un abono se registra contra el saldo del proveedor y se distribuye por antigüedad entre sus compras pendientes.</p>
   {accounts.map(s=><div className="ops-report-row" key={s.supplierId}><strong>{s.supplierName}</strong><span>{s.invoices} compra(s) con saldo</span>
    <b>Saldo: {money(s.balanceCents)}</b></div>)}
   {!accounts.length&&<p className="ops-hint">Sin saldos consultables en esta empresa.</p>}
   <div className="ops-divider"/>
   <h3>Registrar pago al proveedor</h3>
   <label>Proveedor<select value={paidSupplier} onChange={e=>setPaidSupplier(e.target.value)}><option value="">Selecciona proveedor</option>
     {accounts.filter(x=>x.balanceCents>0).map(x=><option key={x.supplierId} value={x.supplierId}>{x.supplierName} · {money(x.balanceCents)}</option>)}</select></label>
   <div className="ops-grid-2"><label>Abono (CAD)<input type="number" min="0.01" step="0.01" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)}/></label>
    <label>Medio<select value={paidMethod} onChange={e=>setPaidMethod(e.target.value)}><option value="transfer">Transferencia</option><option value="debit_card">Débito</option><option value="credit_card">Crédito</option><option value="cash">Efectivo</option><option value="other">Otro</option></select></label></div>
   <label>Referencia del pago<input value={paidRef} onChange={e=>setPaidRef(e.target.value)} placeholder="Referencia bancaria o recibo"/></label>
   <label>Responsable<input value={name} onChange={e=>setName(e.target.value)}/></label>
   <button className="ops-primary" disabled={busy||!paidSupplier||!(Number(paidAmount)>0)||paidRef.trim().length<3} onClick={()=>void act(paySupplier)}>Registrar abono al proveedor</button>
   <p className="ops-hint">Registrar un abono no lo marca automáticamente como conciliado con el banco.</p>
  </div>}
 </section>;
}
