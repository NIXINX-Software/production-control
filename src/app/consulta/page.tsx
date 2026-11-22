'use client';
import {INSTANCE_SITE_ID,INSTANCE_SITE_NAME} from '@/lib/instance-site';
import Link from 'next/link';
import {pcOperationalDate} from '@/lib/pc-date';
import {useCallback,useEffect,useMemo,useState,type CSSProperties} from 'react';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {auth} from '@/lib/firebase';
import {packUnitLabel} from '@/lib/pc-presentation';
import {dailySeries,shiftDay,type ViewProduct,type ViewCount,type ViewBatch,type ViewMovement,type ViewSeries} from '@/lib/pc-consulta-chart';
import '../pc.css';
import './consulta.css';

type Input={id:string;batchId:string;ingredientName:string;quantity:number;unit:string};
type ResponseData={counts:ViewCount[];batches:ViewBatch[];inputs:Input[];movements:ViewMovement[];products:ViewProduct[]};
type Mode='historico'|'simulacion';
const nowDay=()=>pcOperationalDate();
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
const showQuantity=(n:number|null|undefined,u:string)=>n===null||n===undefined||!Number.isFinite(n)?'—':`${n.toLocaleString('es-CA',{maximumFractionDigits:3})} ${packUnitLabel(u)}`;
const captured=(v:ViewCount['capturedAt'])=>{const n=v?._seconds??v?.seconds;return typeof n==='number'?new Date(n*1000).toLocaleString('es-CA',{timeZone:'America/Toronto'}):'—';};

function TrendChart({series,mode,productName}:{series:ViewSeries;mode:Mode;productName:string}){
 const showingSimulation=mode==='simulacion'&&series.projection.length>0;
 const history=showingSimulation&&series.lastClose?series.days.filter(d=>d.date<=series.lastClose!.date):series.days;
 const next=showingSimulation?series.projection:[];
 const all=[...history.map(d=>({date:d.date,open:d.opening,close:d.closing,consumption:d.consumption,production:d.hasProduction?d.production:0,sim:false})),...next.map(d=>({date:d.date,open:null,close:d.closing,consumption:null,production:d.production,sim:true}))];
 if(!all.length)return <p className="pc-chart-empty">No hay fechas disponibles para este periodo.</p>;
 const width=Math.max(810,all.length*43+90),height=320,left=62,right=24,top=28,bottom=47,plotW=width-left-right,plotH=height-top-bottom;
 const measures=all.flatMap(d=>[d.open,d.close,d.consumption,d.production]).filter((x):x is number=>x!==null&&Number.isFinite(x));
 if(series.minimum!==null)measures.push(series.minimum);
 if(series.target!==null)measures.push(series.target);
 const highest=Math.max(1,...measures),lowest=Math.min(0,...measures);
 const pad=(highest-lowest)*0.09||1,yMax=highest+pad,yMin=lowest<0?lowest-pad:0;
 const x=(i:number)=>left+(all.length===1?plotW/2:i*plotW/(all.length-1));
 const y=(val:number)=>top+(yMax-val)/(yMax-yMin)*plotH;
 const segments=(field:'open'|'close'|'consumption',sim:boolean)=>{
  let d='',active=false;
  for(let i=0;i<all.length;i++){
   const point=all[i],v=point[field];
   if(point.sim!==sim||v===null){active=false;continue;}
   d+=`${active?' L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;active=true;
  }
  return d;
 };
 const ticks=Array.from({length:5},(_,i)=>yMin+(yMax-yMin)*i/4);
 const labelsEvery=Math.max(1,Math.ceil(all.length/12));
 return <div className="pc-chart-scroll" tabIndex={0} aria-label={`Gráfica de ${productName}. Desplázate horizontalmente para ver todas las fechas.`}>
  <svg className="pc-line-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comportamiento de ${productName} en ${series.unitName}: líneas de apertura, cierre, consumo y referencias de mínimo y objetivo. Los valores faltantes no se conectan.`}>
   {ticks.map((tick,i)=><g key={i}><line className="pc-chart-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text x={left-9} y={y(tick)+4} textAnchor="end">{tick.toLocaleString('es-CA',{maximumFractionDigits:1})}</text></g>)}
   <text x={left} y="16" fontWeight="bold">{series.unitName}</text>
   {series.minimum!==null&&<g><line x1={left} x2={width-right} y1={y(series.minimum)} y2={y(series.minimum)} stroke="#bc8729" strokeWidth="1.8" strokeDasharray="6 5"/><title>Inventario mínimo: {showQuantity(series.minimum,series.unit)}</title></g>}
   {series.target!==null&&<g><line x1={left} x2={width-right} y1={y(series.target)} y2={y(series.target)} stroke="#9073bf" strokeWidth="1.8" strokeDasharray="6 5"/><title>Inventario objetivo: {showQuantity(series.target,series.unit)}</title></g>}
   {showingSimulation&&<line x1={x(history.length-1)+plotW/(all.length-1)/2} x2={x(history.length-1)+plotW/(all.length-1)/2} y1={top} y2={height-bottom} stroke="#9b8ab7" strokeDasharray="4 6"/>}
   <path d={segments('open',false)} stroke="#2779a8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
   <path d={segments('close',false)} stroke="#14775f" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
   <path d={segments('consumption',false)} stroke="#ba653d" strokeWidth="1.8" strokeDasharray="3 5" fill="none"/>
   <path d={segments('close',true)} stroke="#8255ad" strokeWidth="2.5" strokeDasharray="7 5" fill="none" strokeLinecap="round"/>
   {all.map((point,i)=><g key={point.date}>
    {(i%labelsEvery===0||i===all.length-1||i===history.length-1)&&<text x={x(i)} y={height-15} textAnchor="middle">{point.date.slice(5)}</text>}
    {point.open!==null&&!point.sim&&<circle cx={x(i)} cy={y(point.open)} r="3.2" fill="#2779a8"><title>{point.date} · Apertura: {showQuantity(point.open,series.unit)}</title></circle>}
    {point.close!==null&&<circle cx={x(i)} cy={y(point.close)} r={point.sim?3.6:3.5} fill={point.sim?'#8255ad':'#14775f'}><title>{point.date} · {point.sim?'Cierre simulado':'Cierre contado'}: {showQuantity(point.close,series.unit)}</title></circle>}
    {point.consumption!==null&&!point.sim&&<circle cx={x(i)} cy={y(point.consumption)} r="2.8" fill="#ba653d"><title>{point.date} · Consumo estimado: {showQuantity(point.consumption,series.unit)}</title></circle>}
    {point.production>0&&<g><path d={`M ${x(i)} ${y(point.production)-6} l 6 10 h -12 Z`} fill={point.sim?'#826db0':'#2b9465'} stroke="#fff" strokeWidth="1"><title>{point.date} · {point.sim?'Producción simulada':'Producción registrada'}: {showQuantity(point.production,series.unit)}</title></path></g>}
   </g>)}
  </svg>
 </div>;
}


export default function Consulta(){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const site=INSTANCE_SITE_ID;
 const [from,setFrom]=useState(()=>shiftDay(nowDay(),-13)),[to,setTo]=useState(nowDay());
 const [data,setData]=useState<ResponseData|null>(null),[loading,setLoading]=useState(false),[exporting,setExporting]=useState<'xlsx'|'datamart'|null>(null),[onlySelected,setOnlySelected]=useState(false),[error,setError]=useState('');
 const [productId,setProductId]=useState(''),[mode,setMode]=useState<Mode>('historico');
 useEffect(()=>{if(!auth){const timer=window.setTimeout(()=>setAuthReady(true),0);return()=>window.clearTimeout(timer);}return onAuthStateChanged(auth,u=>{setUser(u);setAuthReady(true);if(!u){setData(null);setProductId('');}});},[]);
 const load=useCallback(async()=>{
  if(!user){setError('Inicia sesión para consultar.');return;}
  setLoading(true);setError('');try{
   const token=await user.getIdToken();const query=new URLSearchParams({site,from,to});
   const response=await fetch(`/api/pc/consultation?${query}`,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
   const result=await response.json() as ResponseData&{error?:string};
   if(!response.ok)throw Error(result.error??'No fue posible consultar la información.');
   setData(result);
   const finished=result.products.filter(p=>p.kind!=='ingredient').sort((a,b)=>a.name.localeCompare(b.name,'es'));
   setProductId(previous=>finished.some(p=>p.id===previous)?previous:(finished[0]?.id??''));
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}
 },[user,site,from,to]);
 const download=useCallback(async(format:'xlsx'|'datamart')=>{
  if(!user||!data)return;
  setExporting(format);setError('');
  try{
   const token=await user.getIdToken();
   const query=new URLSearchParams({site,from,to,format});
   if(onlySelected&&productId)query.set('productId',productId);
   const result=await fetch(`/api/pc/operational-export?${query}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!result.ok){const details=await result.json().catch(()=>({error:'EXPORT_FAILED'})) as {error?:string};throw Error(details.error??'No se pudo descargar el reporte.');}
   const blob=await result.blob(),url=URL.createObjectURL(blob);
   const disposition=result.headers.get('content-disposition')??'';
   const file=disposition.match(/filename="([^"]+)"/)?.[1]??`Production_Control_${site}_${from}_${to}.${format==='xlsx'?'xlsx':'zip'}`;
   const link=document.createElement('a');link.href=url;link.download=file;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setExporting(null);}
 },[user,data,site,from,to,onlySelected,productId]);
 const products=useMemo(()=>data?.products.filter(p=>p.kind!=='ingredient').sort((a,b)=>a.name.localeCompare(b.name,'es'))??[],[data]);
 const selected=products.find(p=>p.id===productId)??null;
 const series=useMemo(()=>selected&&selected.countable!==false&&data?dailySeries(selected,data.counts,data.batches,data.movements,from,to):null,[selected,data,from,to]);
 const invalid=!validDate(from)||!validDate(to)||from>to||to>nowDay()||Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>90*86400000;
 const days=series?.days.slice().reverse()??[];
 const selectedBatches=data?.batches.filter(b=>b.productId===productId&&b.operationalDate>=from&&b.operationalDate<=to)??[];
 const selectedMovements=data?.movements.filter(m=>m.productId===productId)??[];
 return <main className="pc-consulta">
  <header className="pc-consulta-head"><div><p className="ux-eyebrow">HOT TACOS · PRODUCTION CONTROL</p><h1>Consulta operativa</h1><p className="ux-muted">Inventarios y producción por producto. Sin KPIs de Management.</p></div><Link href="/">← Cocina</Link></header>
  {!authReady&&<p>Comprobando acceso…</p>}
  {authReady&&!user&&<section className="ux-paper pc-consulta-login"><h2>Acceso de consulta</h2><p>Tu cuenta debe estar habilitada con el rol <code>viewer</code> o <code>admin</code>.</p><form onSubmit={async e=>{e.preventDefault();if(!auth)return;setError('');try{await signInWithEmailAndPassword(auth,email,password);setPassword('');}catch(err){setError(err instanceof Error?err.message:String(err));}}}><label>Correo<input type="email" value={email} autoComplete="username" onChange={e=>setEmail(e.target.value)} required/></label><label>Contraseña<input type="password" value={password} autoComplete="current-password" onChange={e=>setPassword(e.target.value)} required/></label><button className="ux-main-button" type="submit">Entrar</button></form></section>}
  {user&&<>
   <div className="pc-period"><label>Empresa<strong>{INSTANCE_SITE_NAME}</strong></label><label>Desde<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setData(null);}} max={nowDay()}/></label><label>Hasta<input type="date" value={to} onChange={e=>{setTo(e.target.value);setData(null);}} max={nowDay()}/></label><button className="ux-main-button" disabled={invalid||loading} onClick={()=>void load()}>{loading?'Consultando…':'Consultar periodo'}</button><button className="ux-secondary" onClick={()=>{if(auth)void signOut(auth);}}>Salir</button></div>
   {data&&<>
    <section className="ux-paper pc-export-panel"><div><h2>Exportar información operativa</h2><p className="pc-consulta-subtitle">El Excel contiene existencias, conteos, producción, ingredientes, horas por empleado y movimientos. El ZIP contiene tablas CSV para Data Mart.</p></div><label className="pc-export-choice"><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)} disabled={!selected}/> Exportar solo el producto seleccionado (por defecto: toda la sucursal)</label><div className="pc-export-buttons"><button className="ux-main-button" type="button" disabled={!!exporting} onClick={()=>void download('xlsx')}>{exporting==='xlsx'?'Generando Excel…':'Descargar Excel operativo (.xlsx)'}</button><button className="ux-secondary" type="button" disabled={!!exporting} onClick={()=>void download('datamart')}>{exporting==='datamart'?'Generando datos…':'Descargar datos Data Mart (.zip)'}</button></div><p className="pc-export-note">El Excel incluye columnas para capturar existencias verificadas. Ninguna descarga modifica los conteos guardados. Se utiliza el periodo y la sucursal consultados.</p></section>
    <section className="ux-paper"><div className="pc-chart-actions"><div><h2>Comportamiento del inventario</h2><p className="pc-consulta-subtitle">Selecciona la proteína o producto terminado que deseas analizar.</p></div></div>
     <div className="pc-chart-toolbar"><label className="pc-product-select">Producto<select value={productId} onChange={e=>{setProductId(e.target.value);setMode('historico');}}>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {packUnitLabel(p.bagUnit??'kg')}</option>)}</select></label>{selected?.countable!==false&&<div className="pc-chart-modes" role="group" aria-label="Tipo de gráfica"><button type="button" aria-pressed={mode==='historico'} className={mode==='historico'?'active':''} onClick={()=>setMode('historico')}>Histórico real</button><button type="button" aria-pressed={mode==='simulacion'} className={mode==='simulacion'?'active':''} onClick={()=>setMode('simulacion')}>Simulación 14 días</button></div>}</div>
     {series&&selected?<>
      <div className="pc-chart-stats"><div><small>Último cierre registrado</small><strong>{showQuantity(series.lastClose?.value,series.unit)}</strong><small>{series.lastClose?.date??'Sin registro'}</small></div><div><small>Consumo diario estimado</small><strong>{showQuantity(series.average,series.unit)}</strong><small>{series.sampleDays} días válidos</small></div><div><small>Mínimo · {selected.minDays??3} días</small><strong>{showQuantity(series.minimum,series.unit)}</strong></div><div><small>Objetivo · {selected.targetDays??10} días</small><strong>{showQuantity(series.target,series.unit)}</strong></div></div>
      {mode==='simulacion'&&!series.projection.length?<p className="pc-chart-warning">La simulación requiere al menos 3 días con apertura y cierre válidos, y un cierre físico registrado. No se inventarán cifras para completar el gráfico.</p>:null}
      <TrendChart series={series} mode={mode} productName={selected.name}/>
      <div className="pc-chart-legend"><span><i style={{'--swatch':'#2779a8'} as CSSProperties}/>Apertura</span><span><i style={{'--swatch':'#14775f'} as CSSProperties}/>Cierre</span><span><i className="dashed" style={{'--swatch':'#ba653d'} as CSSProperties}/>Consumo estimado</span><span><i style={{'--swatch':'#2b9465'} as CSSProperties}/>Producción (▲)</span><span><i className="dashed" style={{'--swatch':'#bc8729'} as CSSProperties}/>Mínimo</span><span><i className="dashed" style={{'--swatch':'#9073bf'} as CSSProperties}/>Objetivo</span>{mode==='simulacion'&&<span><i className="dashed" style={{'--swatch':'#8255ad'} as CSSProperties}/>Cierre simulado</span>}</div>
      <p className="pc-chart-note">Los puntos son registros físicos o cálculos derivados de registros. Las fechas sin conteo quedan sin línea. Consumo = apertura + producción − cierre − salidas especiales. La simulación usa el promedio observado y reposiciones teóricas para recuperar el objetivo: no son órdenes de producción ni existencias confirmadas.</p>
      {series.warnings.map((w,i)=><p className="pc-chart-warning" key={i}>{w}</p>)}
     </>:<p className="pc-chart-empty">{selected?.countable===false?"Preparación no contabilizable: registra su producción y consumo como ingrediente sin conteos físicos ni simulación de inventario. Consulta sus producciones a continuación.":"No hay productos terminados en el catálogo de esta sucursal."}</p>}
    </section>
    {selected&&series&&<section className="ux-paper"><h2>Conteos diarios · {selected.name}</h2><p className="pc-consulta-subtitle">Cantidades expresadas en {packUnitLabel(series.unit)}. Cada fecha aparece aunque no se haya contado.</p><div className="pc-table-scroll"><table className="pc-compact-table"><thead><tr><th>Fecha</th><th>Apertura</th><th>Cierre</th><th>Producción</th><th>Salidas especiales</th><th>Consumo estimado</th></tr></thead><tbody>{days.map(d=><tr key={d.date}><th>{d.date}</th>{(['opening','closing'] as const).map(kind=>{const c=data.counts.find(c=>c.operationalDate===d.date&&c.period===kind);const line=c?.lines.find(l=>l.productId===productId);const val=kind==='opening'?d.opening:d.closing;return <td key={kind}>{c&&line?<details><summary>{showQuantity(val,series.unit)}{c.isLateEntry?' · Tardío':''}</summary><div><small>{c.startedByName??'—'} → {c.signedByName??'—'}</small></div><small>Capturado: {captured(c.capturedAt)}</small><div><small>{line.bagCount??0} bolsas</small></div></details>:<span className="ux-muted">Sin registrar</span>}</td>;})}<td>{d.production>0?showQuantity(d.production,series.unit):'—'}</td><td>{d.extraordinary>0?showQuantity(d.extraordinary,series.unit):'—'}</td><td>{d.consumption===null?'—':<span style={{color:d.validConsumption?'inherit':'#a94c35'}}>{showQuantity(d.consumption,series.unit)}{!d.validConsumption?' · Revisar':''}</span>}</td></tr>)}</tbody></table></div></section>}
    {selected&&<section className="ux-paper"><h2>Producción por fecha · {selected.name}</h2><div className="pc-table-scroll"><table className="pc-compact-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Estado</th><th>Resultado final</th><th>Ingredientes</th></tr></thead><tbody>{selectedBatches.length?selectedBatches.map(b=><tr key={b.id}><td>{b.operationalDate}</td><td>{b.productName}</td><td>{b.status==='completed'?'Finalizado':'En curso'}</td><td>{b.status==='completed'?`${b.countableSnapshot===false?'':`${b.bagCount??0} bolsas · `}${showQuantity(b.outputAmount??b.outputKg??0,b.outputUnit??b.bagUnitSnapshot??'kg')}`:'—'}</td><td><details><summary>{data.inputs.filter(i=>i.batchId===b.id).length} registros</summary>{data.inputs.filter(i=>i.batchId===b.id).map(i=><div key={i.id}>{i.ingredientName}: {i.quantity} {i.unit}</div>)}</details></td></tr>):<tr><td colSpan={5}>Sin producciones de este producto durante el periodo.</td></tr>}</tbody></table></div></section>}
    {selected&&<section className="ux-paper"><h2>Salidas especiales · {selected.name}</h2>{selectedMovements.length===0?<p className="ux-muted">Sin movimientos durante el periodo.</p>:<div className="pc-table-scroll"><table className="pc-compact-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Destino / Motivo</th><th>Cantidad</th></tr></thead><tbody>{selectedMovements.map(m=><tr key={m.id}><td>{m.operationalDate}</td><td>{m.productName}</td><td>{m.movementKind==='windsor'?'Windsor':m.movementKind}</td><td>{showQuantity(m.quantity??m.quantityKg??0,m.unit??'kg')}</td></tr>)}</tbody></table></div>}</section>}
   </>}
   {!data&&!loading&&<p className="ux-muted">Selecciona el periodo y pulsa «Consultar periodo».</p>}
  </>}
  {error&&<p className="ux-warning" role="alert">{error}</p>}
 </main>;
}
