'use client';
import {useCompanyProfile} from './company-profile';
import {PC_TENANT} from '@/lib/pc-tenant';
import {pcOperationalDate} from '@/lib/pc-date';
import {useEffect,useState} from 'react';
import {auth} from '@/lib/firebase';
import {addDays,type ForecastDay,type HistoryDay,type PlanRow} from '@/lib/pc-forecast';
import type {ReportPayload} from '@/lib/pc-reports-server';
import type {ManagementData} from '@/lib/pc-management';
import type {Site} from '@/lib/pc-types';
type Lang='es'|'en';
const today=()=>pcOperationalDate();
const number=(v:number|null|undefined)=>v===null||v===undefined?'—':new Intl.NumberFormat('es-CA',{maximumFractionDigits:2}).format(v);
function HistoricalForecastChart({historic,future,min,max}:{historic:HistoryDay[];future:ForecastDay[];min:number|null;max:number|null}){
 const all=[...historic.map(d=>d.date),...future.map(d=>d.date)];
 if(!all.length)return <p className="mi-empty">Sin información para graficar.</p>;
 const w=940,h=320,left=56,right=18,top=22,bottom=42,innerW=w-left-right,innerH=h-top-bottom;
 const values=[...historic.flatMap(d=>[d.openingKg,d.closingKg]),...future.flatMap(d=>[d.openingKg,d.closingKg,d.openingKg+d.productionKg]),min,max].filter((v):v is number=>v!==null&&Number.isFinite(v));
 const cap=Math.max(5,...values)*1.12,base=Math.min(0,...values);
 const x=(i:number)=>left+(all.length<=1?0:i/(all.length-1)*innerW);
 const y=(v:number)=>top+(cap-v)/(cap-base)*innerH;
 const path=(arr:Array<{i:number;value:number|null}>)=>{let result='';let previous=-2;for(const p of arr){if(p.value===null){previous=-2;continue;}result+=`${p.i===previous+1?'L':'M'}${x(p.i).toFixed(2)},${y(p.value).toFixed(2)} `;previous=p.i;}return result;};
 const realOpen=historic.map((d,i)=>({i,value:d.openingKg})),realClose=historic.map((d,i)=>({i,value:d.closingKg}));
 const projected=[...(historic.length?[{i:historic.length-1,value:historic.at(-1)?.closingKg??null}]:[]),...future.map((d,i)=>({i:historic.length+i,value:d.closingKg}))];
 const tick=Math.max(1,Math.ceil(all.length/10));
 return <div className="forecast-svg-scroller"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Inventario histórico y pronosticado en kilogramos, con umbrales objetivo y mínimo" className="forecast-chart">
  {[0,1,2,3,4].map(i=>{const value=base+(cap-base)*i/4;return <g key={i}><line x1={left} y1={y(value)} x2={w-right} y2={y(value)} stroke="#e0e8e4" strokeWidth="1"/><text x={left-8} y={y(value)+4} textAnchor="end" fontSize="11" fill="#596b65">{Math.round(value)} kg</text></g>;})}
  {historic.length>0&&future.length>0&&<><rect x={x(historic.length-1)} y={top} width={Math.max(0,w-right-x(historic.length-1))} height={innerH} fill="#e6f4ed" opacity="0.5"/><line x1={x(historic.length-1)} y1={top} x2={x(historic.length-1)} y2={h-bottom} stroke="#829f92" strokeDasharray="5 5"/></>}
  {max!==null&&<line x1={left} x2={w-right} y1={y(max)} y2={y(max)} stroke="#356b5c" strokeDasharray="8 4" strokeWidth="1.5"/>}
  {min!==null&&<line x1={left} x2={w-right} y1={y(min)} y2={y(min)} stroke="#ca7852" strokeDasharray="8 4" strokeWidth="1.5"/>}
  <path d={path(realOpen)} fill="none" stroke="#5f7895" strokeWidth="2.5"/>
  <path d={path(realClose)} fill="none" stroke="#1e5145" strokeWidth="3"/>
  <path d={path(projected)} fill="none" stroke="#309a80" strokeWidth="3" strokeDasharray="7 4"/>
  {future.filter(d=>d.productionKg>0).map(d=>{const i=all.indexOf(d.date);return <g key={d.date}><circle cx={x(i)} cy={y(d.closingKg)} r="5.5" fill="#22866c"><title>{`${d.date} · Producir ${number(d.productionKg)} kg`}</title></circle></g>;})}
  {all.map((date,i)=>i%tick===0||i===all.length-1?<text key={date+i} x={x(i)} y={h-15} textAnchor="middle" fontSize="10" fill="#51635d">{date.slice(5)}</text>:null)}
 </svg></div>;
}

function actualBatchHours(activities:Array<Record<string,unknown>>,batchId:string):number{
 let milliseconds=0;
 for(const activity of activities.filter(a=>a.batchId===batchId)){
  for(const interval of Array.isArray(activity.intervals)?activity.intervals:[]){
   const row=interval as {startedAt?:string;stoppedAt?:string|null};
   if(!row.startedAt||!row.stoppedAt)continue;
   const start=Date.parse(row.startedAt),end=Date.parse(row.stoppedAt);
   if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)milliseconds+=end-start;
  }
 }
 return Math.round(milliseconds/36000)/100;
}
export function ForecastWorkbench({data,lang,showcase=false,historyFrom:initialFrom,historyTo:initialTo}:{data:ManagementData;lang:Lang;showcase?:boolean;historyFrom?:string;historyTo?:string}){
 const es=lang==='es';const site:Site=PC_TENANT.id;
 const {profile}=useCompanyProfile();const [product,setProduct]=useState(showcase?'protein-01':'');
 const [from,setFrom]=useState(initialFrom??addDays(today(),-29)),[to,setTo]=useState(initialTo??today());
 const [baseFrom,setBaseFrom]=useState(addDays(today(),-29)),[baseTo,setBaseTo]=useState(today());
 const [days,setDays]=useState(14),[excluded,setExcluded]=useState('');
 const [eventFrom,setEventFrom]=useState(''),[eventTo,setEventTo]=useState(''),[growth,setGrowth]=useState('0'),[extra,setExtra]=useState('0'),[eventName,setEventName]=useState('Evento planeado');
 const [report,setReport]=useState<ReportPayload|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[watermark,setWatermark]=useState(''),[scheduledEvents,setScheduledEvents]=useState<Array<{from:string;to:string;growthPct:number;extraKg:number;label:string}>>([]),[blockedUntil,setBlockedUntil]=useState(''),[blockReason,setBlockReason]=useState('');
 const availableProducts=data.productCatalog.filter(p=>p.siteIds.includes(site));
 // Derive a valid selection without calling setState inside an effect.
 // Switching locations immediately selects the first product available there.
 const selectedProduct=showcase?'protein-01':availableProducts.some(p=>p.id===product)?product:(availableProducts[0]?.id??'');
 // Produce una cadena estable: el efecto de showcase depende del valor,
 // no de un objeto URLSearchParams nuevo en cada render.
 const url=(()=>{
  const q=new URLSearchParams({site,product:selectedProduct,from,to,baseFrom,baseTo,days:String(days)});
  if(excluded.trim())q.set('excluded',excluded.replace(/\s/g,''));
  if(blockedUntil)q.set('blockedUntil',blockedUntil);
  if(blockReason)q.set('blockReason',blockReason);
  const allEvents=[...scheduledEvents,...(eventFrom&&eventTo?[{from:eventFrom,to:eventTo,growthPct:Number(growth),extraKg:Number(extra),label:eventName}]:[])];
  if(allEvents.length)q.set('events',JSON.stringify(allEvents));
  return q.toString();
 })();
 async function request(format:'report'|'export'){
  const token=showcase?'':await auth?.currentUser?.getIdToken();if(!showcase&&!token)throw Error('Inicia sesión de Management nuevamente.');
  const query=new URLSearchParams(url);if(format==='export'&&watermark)query.set('updatedSince',watermark+':00Z');
  const path=showcase?'/api/showcase-report':format==='export'?'/api/pc/export':'/api/pc/report';
  const response=await fetch(`${path}?${query}`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:'no-store'});
  if(!response.ok){const detail=await response.json().catch(()=>({error:'REQUEST_FAILED'})) as {error?:string};throw Error(detail.error||'REQUEST_FAILED');}
  if(format==='export'){const blob=await response.blob();const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=`production-control-v1-${from}-${to}.xlsx`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(href);}else setReport(await response.json() as ReportPayload);
 }
 async function run(){if(!selectedProduct||from>to||baseFrom>baseTo){setError(es?'Revisa producto y fechas.':'Check product and dates.');return;}setLoading(true);setError('');try{await request('report');}catch(e){setError(String(e));}finally{setLoading(false);}}
 async function exportFile(){setExporting(true);setError('');try{await request('export');}catch(e){setError(String(e));}finally{setExporting(false);}}
 useEffect(()=>{if(!showcase)return;let cancelled=false;
  void (async()=>{try{const response=await fetch(`/api/showcase-report?${url}`,{cache:'no-store'});if(!response.ok)throw new Error('DEMO_REPORT_UNAVAILABLE');
   const result=await response.json() as ReportPayload;if(!cancelled){setReport(result);setError('');}
  }catch(e){if(!cancelled)setError(String(e));}})();return()=>{cancelled=true;};},[showcase,url]);
 const s=report?.scenario;
 return <section className="mi-panel forecast-workbench">
  <div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'PRONÓSTICO Y PLANIFICACIÓN':'FORECAST & PLANNING'}</p><h2>{es?'Inventario, consumo y próximos ciclos':'Inventory, demand and future batches'}</h2><p className="ux-muted">{es?'Gráfica histórica y simulación separadas. El pronóstico no crea órdenes de compra ni lotes reales.':'Independent historical chart and scenario. The forecast does not create real orders.'}</p></div></div>
  <div className="forecast-filters">
   <label>{es?'Sucursal':'Location'}<strong>{profile.name}</strong></label>
   <label>{es?'Proteína':'Product'}<select value={selectedProduct} disabled={showcase} onChange={e=>setProduct(e.target.value)}>{showcase?<option value="protein-01">Proteína P-01 · Demo</option>:<><option value="">{es?'Seleccionar':'Select'}</option>{availableProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</>}</select></label>
   <label>{es?'Histórico desde':'History from'}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>{es?'Histórico hasta':'History to'}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   <label>{es?'Periodo base desde':'Baseline from'}<input type="date" value={baseFrom} onChange={e=>setBaseFrom(e.target.value)}/></label>
   <label>{es?'Periodo base hasta':'Baseline to'}<input type="date" value={baseTo} onChange={e=>setBaseTo(e.target.value)}/></label>
   <label>{es?'Forecast (días)':'Forecast days'}<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>7</option><option value={14}>14</option><option value={30}>30</option><option value={60}>60</option><option value={90}>90</option></select></label>
   <label>{es?'Fechas excluidas del promedio':'Excluded date ranges'}<input value={excluded} onChange={e=>setExcluded(e.target.value)} placeholder="2026-12-24:2027-01-01" title="Una o más fechas desde:hasta, separadas por coma"/></label>
  </div>
  <details className="forecast-events"><summary>{es?'Ajuste extraordinario: festividad, catering o evento':'Special adjustment: holiday, catering or event'}</summary><div className="forecast-filters">
   <label>{es?'Evento desde':'Event from'}<input type="date" value={eventFrom} onChange={e=>setEventFrom(e.target.value)}/></label><label>{es?'Hasta':'To'}<input type="date" value={eventTo} onChange={e=>setEventTo(e.target.value)}/></label>
   <label>{es?'Ajuste de demanda (%)':'Demand adjustment (%)'}<input type="number" min="-100" max="500" step="1" value={growth} onChange={e=>setGrowth(e.target.value)}/></label>
   <label>{es?'Demanda adicional (kg por día)':'Additional demand (kg/day)'}<input type="number" min="0" step="0.1" value={extra} onChange={e=>setExtra(e.target.value)}/></label>
   <label>{es?'Motivo':'Reason'}<input value={eventName} maxLength={80} onChange={e=>setEventName(e.target.value)}/></label></div>
   <div className="forecast-actions"><button className="ux-secondary" type="button" disabled={!eventFrom||!eventTo||eventFrom>eventTo||scheduledEvents.length>=18} onClick={()=>{setScheduledEvents(list=>[...list,{from:eventFrom,to:eventTo,growthPct:Number(growth),extraKg:Number(extra),label:eventName}]);setEventFrom('');setEventTo('');setGrowth('0');setExtra('0');setEventName('Evento planeado');}}>{es?'+ Agregar evento al escenario':'+ Add event'}</button></div>
   {scheduledEvents.map((v,i)=><div key={i} className="forecast-event-row"><span>{v.label} · {v.from} → {v.to} · {v.growthPct}% · {v.extraKg} kg/día</span><button className="ux-secondary" type="button" onClick={()=>setScheduledEvents(list=>list.filter((_,j)=>i!==j))}>{es?'Quitar':'Remove'}</button></div>)}
   <p className="ux-muted">{es?'El aumento se aplica solo a las fechas indicadas. Para un catering de un único día, usa la misma fecha en ambos campos. No dupliques el efecto de una festividad si ya está incluido en el periodo base.':'Only dates in the event interval are affected.'}</p>
  </details>
  <details className="forecast-events"><summary>{es?'Restricción: compras / proveedor / fondos':'Supply constraint / payment / vendor'}</summary><div className="forecast-filters"><label>{es?'No podrá producirse hasta después de':'Cannot produce until after'}<input type="date" value={blockedUntil} onChange={e=>setBlockedUntil(e.target.value)}/></label><label>{es?'Motivo del retraso':'Reason'}<input maxLength={120} value={blockReason} onChange={e=>setBlockReason(e.target.value)} placeholder="Proveedor sin existencias / presupuesto pendiente"/></label></div><p className="ux-muted">{es?'La simulación mostrará quiebres de inventario y la producción posterior necesaria.':'The simulation shows shortages and the recovery batch.'}</p></details>
  <div className="forecast-actions"><button type="button" className="ux-main-button" disabled={loading||!selectedProduct} onClick={()=>void run()}>{loading?(es?'Calculando…':'Calculating…'):(es?'Generar gráfica y plan':'Generate chart and plan')}</button>{!showcase&&<button type="button" className="ux-secondary" disabled={exporting||!report} onClick={()=>void exportFile()}>{exporting?'Exportando…':'Descargar Excel (.xlsx)'}</button>}</div>
  {!showcase&&report&&<details className="forecast-events"><summary>Data Mart · extracción incremental</summary><label>Exportar solamente registros modificados desde (UTC, opcional)<input type="datetime-local" value={watermark} onChange={e=>setWatermark(e.target.value)}/></label><small className="ux-muted">Primera carga: dejar vacío. Para cargas incrementales usar la marca UTC de la última extracción; mantén un margen de solapamiento y deduplica por ID.</small></details>}
  {error&&<p role="alert" className="ux-message">{error}</p>}
  {s&&<>
    <div className="mi-kpis forecast-metrics"><article><span>{es?'Consumo medio válido':'Valid average demand'}</span><strong>{number(s.meanDailyKg)} kg/día</strong><small>{s.sampleDays} días válidos · {es?'base seleccionada':'selected baseline'}</small></article><article><span>{es?'Mínimo de cobertura':'Minimum coverage'}</span><strong>{number(s.minimumKg)} kg</strong></article><article><span>{es?'Inventario objetivo':'Target inventory'}</span><strong>{number(s.targetKg)} kg</strong></article><article><span>{es?'Próximos lotes proyectados':'Projected batches'}</span><strong>{s.plan.length}</strong></article><article><span>{es?'Producción del periodo':'Period production'}</span><strong>{number(report?.metrics.outputKg)} kg</strong></article><article><span>{es?'Productividad laboral':'Labor productivity'}</span><strong>{number(report?.metrics.kgPerLaborHour)} kg/h</strong></article></div>
    <HistoricalForecastChart historic={s.historical} future={s.forecast} min={s.minimumKg} max={s.targetKg}/>
    <div className="forecast-legend"><span>━ {es?'Apertura histórica':'Opening history'}</span><span>━ {es?'Cierre histórico':'Closing history'}</span><span>┄ Forecast</span><span>┄ {es?'Objetivo':'Target'}</span><span>┄ {es?'Mínimo':'Minimum'}</span></div>
    {s.alerts.length>0&&<div className="forecast-alerts">{s.alerts.map((a,i)=><p key={i} role="status">⚠ {a}</p>)}</div>}
    <h3>{es?'Próximas producciones y requerimientos':'Upcoming production and requirements'}</h3>
    <div className="forecast-table-wrap"><table className="forecast-table"><thead><tr><th>{es?'Fecha prevista':'Expected date'}</th><th>{es?'Producto':'Product'}</th><th>{es?'Producir':'Output'}</th><th>{es?'Insumos registrados':'Logged inputs'}</th><th>{es?'Horas-hombre est.':'Est. labor'}</th><th>{es?'Inventario posterior':'After output'}</th><th>Alerta</th></tr></thead><tbody>{s.plan.map((r:PlanRow,i:number)=><tr key={`${r.date}-${i}`}><td>{r.date}</td><td>{r.productName}</td><td><strong>{number(r.plannedKg)} kg</strong></td><td>{r.requirements.length?'Estimación por consumo real':'Sin histórico'}</td><td>{r.laborHours===null?'Sin referencia':`${number(r.laborHours)} h`}</td><td>{number(r.afterProductionKg)} kg</td><td>{r.alert||r.status}{r.requirements.length>0&&<details><summary>{es?'Ingredientes estimados':'Estimated inputs'}</summary>{r.requirements.map((q,i)=><div key={i}>{q.name}: {number(q.quantity)} {q.unit}</div>)}</details>}</td></tr>)}{!s.plan.length&&<tr><td colSpan={7}>{es?'Sin lotes planificables con los datos seleccionados.':'No plannable batches for these inputs.'}</td></tr>}</tbody></table></div>
    {report?.source.batches.some(b=>b.status==='completed')&&<>
      <h3>{es?'Historial de producción por lote':'Batch production history'}</h3>
      <div className="forecast-table-wrap"><table className="forecast-table"><thead><tr><th>{es?'Fecha':'Date'}</th><th>{es?'Producto':'Product'}</th><th>{es?'Producción obtenida':'Finished output'}</th><th>{es?'Ingredientes utilizados':'Ingredients used'}</th><th>{es?'Horas-hombre':'Labor hours'}</th></tr></thead><tbody>
        {report.source.batches.filter(b=>b.status==='completed').sort((a,b)=>String(b.operationalDate).localeCompare(String(a.operationalDate))).map(b=>{
          const batchInputs=report.source.inputs.filter(i=>i.batchId===b.id);
          const bags=typeof b.bagCount==='number'?b.bagCount:null;
          const extraKg=typeof b.partialKg==='number'?b.partialKg:0;
          return <tr key={String(b.id)}><td>{String(b.operationalDate??'')}</td><td>{String(b.productName??report.product.name)}</td><td><strong>{number(Number(b.outputKg??0))} kg</strong>{bags!==null&&<small className="forecast-actual-breakdown">{bags} {es?'bolsas':'bags'} + {number(extraKg)} kg {es?'adicionales':'extra'}</small>}</td><td>{batchInputs.length?<details><summary>{es?`Ver ${batchInputs.length} registros`:`View ${batchInputs.length} records`}</summary><ul className="forecast-ingredient-list">{batchInputs.map(input=><li key={String(input.id)}>{String(input.ingredientName??input.ingredientId??'Ingrediente')}: <strong>{number(Number(input.quantity??0))} {String(input.unit??'')}</strong></li>)}</ul></details>:(es?'Sin ingredientes registrados':'No ingredients logged')}</td><td>{number(actualBatchHours(report.source.activities,String(b.id)))} h</td></tr>;
        })}
      </tbody></table></div>
    </>}
    <p className="mi-method">{es?'Los lotes son simulados, no aprobados. Los kg de ingredientes proceden de proporciones de lotes históricos (no de receta certificada); validar con Cocina y Compras antes de ejecutar. Movimientos a Food Truck, caterings y mermas requieren registrarse como movimientos separados para no alterar el consumo.':'Forecast batches are simulations. Ingredient estimates must be reviewed before ordering.'}</p>
  </>}
 </section>;
}
