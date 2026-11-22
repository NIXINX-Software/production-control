'use client';
import {pcOperationalDate} from '@/lib/pc-date';

import {useEffect,useState,type CSSProperties} from 'react';
import {auth} from '@/lib/firebase';
import {addDays} from '@/lib/pc-forecast';
import {ForecastWorkbench} from './forecast-workbench';
import type {ManagementData} from '@/lib/pc-management';

type Lang='es'|'en';

function num(value:number,digits=0){return new Intl.NumberFormat(undefined,{maximumFractionDigits:digits}).format(value);}
function pct(value:number){return `${num(value,1)}%`;}

function Gauge({value,label}:{value:number;label:string}){
 const safe=Math.max(0,Math.min(100,value));
 return <div className="mi-gauge-wrap"><div className="mi-gauge" style={{'--gauge':`${safe*3.6}deg`} as CSSProperties}><div><strong>{pct(safe)}</strong><span>{label}</span></div></div></div>;
}

export function ManagementDashboard({data,lang,email,onRefresh,onLogout,showcase=false}:{data:ManagementData;lang:Lang;email?:string;onRefresh:()=>void;onLogout?:()=>void;showcase?:boolean}){
 const es=lang==='es';
 const today=pcOperationalDate();
 const [from,setFrom]=useState(addDays(today,-29)),[to,setTo]=useState(today),[applied,setApplied]=useState({from:addDays(today,-29),to:today});
 const [filtered,setFiltered]=useState<ManagementData|null>(null),[filterError,setFilterError]=useState(''),[filterLoading,setFilterLoading]=useState(false);
 useEffect(()=>{
  if(showcase)return;
  let cancelled=false;
  void (async()=>{setFilterLoading(true);try{const token=await auth?.currentUser?.getIdToken();if(!token)throw new Error('AUTH_REQUIRED');
    const q=new URLSearchParams(applied);const r=await fetch(`/api/pc/management?${q}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const result=await r.json() as ManagementData;if(!cancelled){setFiltered(result);setFilterError('');}
   }catch(e){if(!cancelled)setFilterError(String(e));}finally{if(!cancelled)setFilterLoading(false);}})();
  return()=>{cancelled=true;};
 },[showcase,applied]);
 const shown=showcase?data:filtered??data;
 const maxOutput=Math.max(1,...shown.bySite.map(x=>x.outputKg));
 const maxEmployee=Math.max(1,...shown.byEmployee.map(x=>x.trackedLaborHours));
 const maxProduct=Math.max(1,...shown.byProduct.map(x=>x.outputKg));
 const maxTrend=Math.max(1,...shown.trend.map(x=>x.outputKg));
 return <section className="mi-dashboard">
  <div className="mi-title-row"><div><p className="ux-eyebrow">MANAGEMENT INFORMATION</p><h1>{es?'Control de producción · KPIs':'Production Control · KPIs'}</h1><p className="ux-muted">{showcase?(es?'Indicadores derivados de conteos, producción, tiempos e insumos.':'Indicators derived from counts, production, time and inputs.'):(es?'Indicadores derivados de conteos, producción, tiempos e insumos. Sólo superadministradores.':'Indicators derived from counts, production, time and inputs. Super admins only.')}</p></div><div className="mi-admin-actions">{!showcase&&email?<small>{email}</small>:null}{!showcase&&<a className="ux-secondary" href="/usuarios" style={{textDecoration:"none",display:"inline-flex",alignItems:"center"}}>{es?"Administrar usuarios":"Manage users"}</a>}<button className="ux-secondary" onClick={onRefresh}>{es?'Actualizar':'Refresh'}</button>{!showcase&&onLogout?<button className="ux-secondary" onClick={onLogout}>{es?'Cerrar sesión':'Sign out'}</button>:null}</div></div>

  {!showcase&&<div className="mi-period-filter"><label>{es?'KPIs desde':'KPIs from'}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{es?'Hasta':'To'}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button type="button" className="ux-main-button" disabled={filterLoading||from>to||Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>90*86400000} onClick={()=>{setFiltered(null);setApplied({from,to});}}>{filterLoading?'Filtrando…':es?'Aplicar periodo':'Apply period'}</button><span className="ux-muted">{filterLoading?'Actualizando datos…':`Periodo: ${applied.from} → ${applied.to}`}</span>{filterError&&<span role="alert" className="ux-muted">{filterError}</span>}</div>}
  <div className="mi-kpis">
   <article><span>{es?'Cobertura de pares de conteo':'Count pair coverage'}</span><strong>{pct(shown.summary.countPairCompletionPct)}</strong><small>{shown.summary.completedCountPairs}/{shown.summary.observedCountDays} {es?'días observados completos':'observed days complete'}</small></article>
   <article><span>{es?'Producción terminada':'Completed production'}</span><strong>{num(shown.summary.outputKg,1)} kg</strong><small>{num(shown.summary.bagsProduced)} {es?'bolsas':'bags'} · {num(shown.summary.completedBatches)} {es?'lotes':'batches'}</small></article>
   <article><span>{es?'Horas-hombre registradas':'Tracked labor hours'}</span><strong>{num(shown.summary.trackedLaborHours,1)} h</strong><small>{num(shown.summary.runningTimers)} {es?'timers activos':'running timers'}</small></article>
   <article><span>{es?'Consumo estimado':'Estimated consumption'}</span><strong>{num(shown.summary.estimatedConsumptionKg,1)} kg</strong><small>{es?'Apertura + producción − cierre':'Opening + production − closing'}</small></article>
   <article><span>{es?'Preparaciones abiertas':'Open batches'}</span><strong>{num(shown.summary.activeBatches)}</strong><small>{es?'deben cerrarse al terminar':'should be closed when finished'}</small></article>
   <article><span>{es?'Calidad del dato':'Data quality'}</span><strong>{num(shown.summary.countCorrections)}</strong><small>{es?'correcciones · ': 'corrections · '}{num(shown.summary.lateEntries)} {es?'capturas posteriores':'late entries'}</small></article>
  </div>

  <div className="mi-gauges">
   <Gauge value={shown.summary.countPairCompletionPct} label={es?'Conteos completos':'Complete counts'}/>
   <Gauge value={shown.summary.observedCountDays?100-(shown.summary.singleCountDays/shown.summary.observedCountDays*100):100} label={es?'Consistencia diaria':'Daily consistency'}/>
   <Gauge value={shown.summary.completedBatches+shown.summary.activeBatches?shown.summary.completedBatches/(shown.summary.completedBatches+shown.summary.activeBatches)*100:100} label={es?'Lotes cerrados':'Closed batches'}/>
  </div>

  <div className="mi-grid-two">
   <section className="mi-panel"><div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'POR OPERACIÓN':'BY OPERATION'}</p><h2>{es?'Indicadores de la empresa':'Company indicators'}</h2></div></div><div className="mi-site-table">{shown.bySite.map(row=><article key={row.siteId}><div className="mi-site-top"><div><strong>{row.siteName}</strong><small>{row.siteId.toUpperCase()}</small></div><b>{pct(row.countPairCompletionPct)}</b></div><div className="mi-bar"><span style={{width:`${Math.min(100,row.outputKg/maxOutput*100)}%`}}/></div><div className="mi-site-stats"><span>{num(row.outputKg,1)} kg {es?'producidos':'produced'}</span><span>{num(row.trackedLaborHours,1)} h</span><span>{num(row.estimatedConsumptionKg,1)} kg {es?'consumo est.':'est. usage'}</span><span>{row.activeBatches} {es?'abiertos':'open'}</span></div></article>)}</div></section>
   <section className="mi-panel"><div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'EXCEPCIONES':'EXCEPTIONS'}</p><h2>{es?'Semáforo operativo':'Operational alerts'}</h2></div><span className={shown.alerts.some(a=>a.severity==='critical')?'mi-light red':shown.alerts.length?'mi-light yellow':'mi-light green'}>{shown.alerts.length}</span></div><div className="mi-alerts">{shown.alerts.length?shown.alerts.map((a,i)=><article key={`${a.kind}-${i}`} className={a.severity==='critical'?'critical':'warning'}><span className="mi-dot"/><div><strong>{a.title}</strong><small>{a.siteId.toUpperCase()} · {a.detail}</small></div></article>):<p className="mi-empty">{es?'Sin excepciones detectadas.':'No exceptions detected.'}</p>}</div></section>
  </div>

  <div className="mi-grid-two">
   <section className="mi-panel"><div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'PERSONAL':'PEOPLE'}</p><h2>{es?'Carga y tiempo registrado':'Workload and tracked time'}</h2></div></div><div className="mi-ranking">{shown.byEmployee.slice(0,12).map(row=><article key={row.employeeId}><div><strong>{row.employeeName}</strong><small>{row.batchesTouched} {es?'lotes':'batches'} · {row.ingredientEntries} {es?'registros de insumo':'input records'}{row.runningTimers?` · ${row.runningTimers} ${es?'timer activo':'running timer'}`:''}</small></div><div className="mi-rank-value"><div className="mi-bar"><span style={{width:`${Math.min(100,row.trackedLaborHours/maxEmployee*100)}%`}}/></div><b>{num(row.trackedLaborHours,1)} h</b></div></article>)}</div></section>
   <section className="mi-panel"><div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'PRODUCTOS':'PRODUCTS'}</p><h2>{es?'Producción por producto':'Production by product'}</h2></div></div><div className="mi-ranking">{shown.byProduct.slice(0,12).map(row=><article key={row.productId}><div><strong>{row.productName}</strong><small>{row.completedBatches} {es?'lotes':'batches'} · {num(row.bagsProduced)} {es?'bolsas':'bags'} · {num(row.trackedLaborHours,1)} h</small></div><div className="mi-rank-value"><div className="mi-bar"><span style={{width:`${Math.min(100,row.outputKg/maxProduct*100)}%`}}/></div><b>{num(row.outputKg,1)} kg</b></div></article>)}</div></section>
  </div>

  <section className="mi-panel"><div className="mi-panel-head"><div><p className="ux-eyebrow">{es?'HISTÓRICO':'HISTORY'}</p><h2>{es?'Producción mensual':'Monthly production'}</h2></div></div><div className="mi-trend">{shown.trend.map(row=><article key={row.month}><div className="mi-trend-bar"><span style={{height:`${Math.max(4,row.outputKg/maxTrend*100)}%`}}/></div><strong>{row.month}</strong><small>{num(row.outputKg,0)} kg</small><small>{num(row.trackedLaborHours,1)} h</small></article>)}</div></section>

  <ForecastWorkbench data={data} lang={lang} showcase={showcase} historyFrom={applied.from} historyTo={applied.to}/>
  <p className="mi-method">{es?'Metodología: “consumo estimado” sólo se calcula cuando existe apertura y cierre del mismo día/producto; fórmula = inventario de apertura + producción terminada del día − inventario de cierre. Los KPIs no sustituyen una conciliación contable.':'Method: “estimated consumption” is calculated only when opening and closing counts exist for the same day/product; formula = opening inventory + completed production − closing inventory. KPIs do not replace accounting reconciliation.'}</p>
 </section>;
}
