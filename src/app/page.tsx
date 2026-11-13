'use client';
import {pcOperationalDate} from '@/lib/pc-date';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import type {Site} from '@/lib/pc-types';
import {PC_UNITS} from '@/lib/pc-units';
import {PACK_UNITS,packUnitLabel,presentation,productQuantity} from '@/lib/pc-presentation';
import {auth} from '@/lib/firebase';
import {isSuperAdminEmail} from '@/lib/super-admin';
import type {ManagementData} from '@/lib/pc-management';
import {ManagementDashboard} from './management-dashboard';
import './pc.css';

type Product={id:string;name:string;kind:'finished'|'ingredient';category:string;bagWeightKg:number|null;bagSize?:number;bagUnit?:string;defaultUnit?:string;active:boolean;siteIds:Site[];countable?:boolean;targetDays?:number;minDays?:number;preparationProcess?:string};
type Employee={id:string;name:string;active:boolean;siteIds:Site[]};
type CountLine={productId:string;productName:string;bagCount:number;openKg?:number|null;openAmount?:number;totalAmount?:number;quantityUnit?:string;bagSizeSnapshot?:number;bagUnitSnapshot?:string;bagWeightKgSnapshot:number|null};
type Count={id:string;siteId:Site;operationalDate:string;period:'opening'|'closing';startedByName:string;signedByName:string;signerMismatch:boolean;lines:CountLine[];correctionCount?:number;correctedByName?:string;capturedAt?:{_seconds?:number;seconds?:number};isLateEntry?:boolean};
type Batch={id:string;siteId:Site;productId:string;productName:string;operationalDate:string;status:string;countableSnapshot?:boolean;createdById?:string;bagCount?:number;partialKg?:number|null;partialAmount?:number;outputKg?:number|null;outputAmount?:number;outputUnit?:string;bagSizeSnapshot?:number;bagUnitSnapshot?:string;bagWeightKgSnapshot?:number|null;processSnapshot?:string;createdByName:string;correctionCount?:number};
type Activity={id:string;batchId:string;employeeId:string;employeeName:string;running:boolean;intervals:{startedAt:string;stoppedAt:string|null}[]};
type IngredientInput={id:string;batchId:string;ingredientId:string;ingredientName:string;quantity:number;unit:string;employeeId:string;employeeName:string;correctionCount?:number};
type Movement={id:string;siteId:Site;productId:string;productName:string;operationalDate:string;movementKind:string;quantityKg:number|null;quantity?:number;unit?:string};
type Data={products:Product[];staff:Employee[];counts:Count[];batches:Batch[];activities:Activity[];inputs:IngredientInput[];movements:Movement[]};
type Lang='es'|'en';type Tab='home'|'counts'|'production'|'catalog'|'management';type View='product'|'person';
const empty:Data={products:[],staff:[],counts:[],batches:[],activities:[],inputs:[],movements:[]};
const locations:{id:Site;name:string}[]=[{id:'htl',name:'Leamington'},{id:'htw',name:'Windsor'},{id:'htft',name:'Food Truck'}];
const translations={
 es:{count:'Contar bolsas',cook:'Estoy cocinando',manage:'Catálogos',home:'Inicio',myWork:'Producción',branch:'Sucursal',lang:'Idioma',refresh:'Actualizar',hello:'¿Qué necesitas hacer?',subtitle:'Elige una actividad. Solo te mostraremos lo necesario.',countDesc:'Contar las bolsas de la cámara fría.',cookDesc:'Preparar productos, agregar ingredientes y registrar tiempo.',manageDesc:'Dar de alta empleados, productos e ingredientes.',opening:'Al abrir',closing:'Al cerrar',when:'¿Cuándo estás contando?',date:'Fecha del conteo',who:'¿Quién está contando?',choose:'Toca tu nombre para continuar',next:'Continuar',back:'Volver',bags:'bolsas',perBag:'kg por bolsa',sign:'¿Quién terminó el conteo?',change:'Cambiar',review:'Revisar el conteo',save:'Guardar conteo',cancel:'Cancelar',previous:'Conteos guardados',all:'Todos',none:'Todavía no hay registros',total:'Total',correct:'Corregir',reason:'¿Por qué estás corrigiendo?',reasonHint:'Ej. Se capturaron kg en lugar de gramos',corrector:'¿Quién hace la corrección?',saveChange:'Guardar corrección',signedWarning:'La persona que terminó es diferente de quien inició. Confirma antes de guardar.',remember:'Revisa las cantidades y la fecha antes de guardar.',product:'Producto',worker:'Persona',byProduct:'Por producto',byPerson:'Por persona',createBatch:'Nueva preparación',creator:'¿Quién inicia la preparación?',create:'Iniciar preparación',ingredient:'Ingrediente',searchIngredient:'Buscar ingrediente…',addNew:'Agregar nuevo ingrediente',unit:'Unidad',amount:'Cantidad',record:'Registrar ingrediente',start:'Iniciar / Reanudar',pause:'Pausar',finish:'Finalizar preparación',finished:'Preparación terminada',finishedProduct:'Producto terminado',active:'Activo',inactive:'Inactivo',name:'Nombre',type:'Tipo',category:'Categoría',weight:'Peso por bolsa (kg)',locations:'Sucursales',saveCatalog:'Guardar',products:'Productos terminados',ingredients:'Ingredientes',staff:'Personal',add:'Nuevo',edit:'Editar',search:'Buscar…',effective:'Tiempo trabajado',produced:'Bolsas obtenidas',noStaff:'Agrega empleados en Catálogos.',noProducts:'Agrega productos terminados en Catálogos.',addIngredientPrompt:'No existe en el catálogo. Agrégalo aquí.',reviewCorrection:'Se guardará la corrección con el valor anterior, el motivo, el empleado y la hora del servidor.',readOnly:'En Internet, los cambios siguen bloqueados hasta integrar la autenticación centralizada.',error:'No se pudo guardar',saved:'Guardado correctamente',chooseName:'Selecciona un nombre',closed:'Finalizado',running:'En curso',noCorrection:'No hay cambios.',countProducts:'¿Cuántas bolsas hay de cada producto?',labelInput:'Registro de ingredientes',notes:'La producción no sustituye el conteo físico.',selectUnit:'Selecciona unidad',work:'Trabajando en',done:'Listo',fixOutput:'Corregir bolsas producidas'},
 en:{count:'Count bags',cook:'I am cooking',manage:'Catalogs',home:'Home',myWork:'Production',branch:'Location',lang:'Language',refresh:'Refresh',hello:'What would you like to do?',subtitle:'Choose an activity. We will only show what you need.',countDesc:'Count bags in cold storage.',cookDesc:'Prepare products, add ingredients, and track work time.',manageDesc:'Add employees, finished products, and ingredients.',opening:'Opening',closing:'Closing',when:'When are you counting?',date:'Count date',who:'Who is counting?',choose:'Tap your name to continue',next:'Continue',back:'Back',bags:'bags',perBag:'kg per bag',sign:'Who finished the count?',change:'Change',review:'Review count',save:'Save count',cancel:'Cancel',previous:'Saved counts',all:'All',none:'No records yet',total:'Total',correct:'Correct',reason:'Why are you correcting this?',reasonHint:'E.g., kilograms entered instead of grams',corrector:'Who is making this correction?',saveChange:'Save correction',signedWarning:'The person who finished is different from the starter. Confirm before saving.',remember:'Double-check amounts and date before saving.',product:'Product',worker:'Employee',byProduct:'By product',byPerson:'By employee',createBatch:'New preparation',creator:'Who starts this preparation?',create:'Start preparation',ingredient:'Ingredient',searchIngredient:'Search ingredients…',addNew:'Add new ingredient',unit:'Unit',amount:'Quantity',record:'Record ingredient',start:'Start / Resume',pause:'Pause',finish:'Finish preparation',finished:'Completed preparation',finishedProduct:'Finished product',active:'Active',inactive:'Inactive',name:'Name',type:'Type',category:'Category',weight:'Bag weight (kg)',locations:'Locations',saveCatalog:'Save',products:'Finished products',ingredients:'Ingredients',staff:'Employees',add:'New',edit:'Edit',search:'Search…',effective:'Work time',produced:'Bags produced',noStaff:'Add employees in Catalogs.',noProducts:'Add finished products in Catalogs.',addIngredientPrompt:'Not in the catalog? Add it here.',reviewCorrection:'The original value, reason, editor and server timestamp will be retained.',readOnly:'Online changes are disabled until central authentication is integrated.',error:'Could not save',saved:'Saved successfully',chooseName:'Select a name',closed:'Completed',running:'Active',noCorrection:'No changes.',countProducts:'How many bags of each product are there?',labelInput:'Ingredients used',notes:'Production does not replace a physical count.',selectUnit:'Select unit',work:'Working on',done:'Done',fixOutput:'Correct produced bags'}
} as const;
const dateMinus=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')-days*86400000).toISOString().slice(0,10);
const today=()=>pcOperationalDate();
// The open-bag quantity must remain strictly below one complete bag.
// Store up to three decimals, consistently with pc-presentation.validPartial().
function openBagMaximum(size:number,unit:string):number {
 if(!Number.isFinite(size)||size<=0)return 0;
 if(unit==='unit'||unit==='portion')return Math.max(0,Math.ceil(size)-1);
 return Math.max(0,Number((size-0.001).toFixed(3)));
}
function openBagIncrement(size:number,unit:string):number {
 if(unit==='unit'||unit==='portion')return 1;
 return size<=0.2?0.001:size<=1?0.01:0.1;
}
function normalizeOpenBag(raw:string,previous:string|undefined,size:number,unit:string):string {
 if(raw==='')return '';
 const numeric=Number(raw);
 const maximum=openBagMaximum(size,unit);
 // Reject invalid input instead of silently inventing a quantity (e.g. 20 L -> 19.999 L).
 if(!Number.isFinite(numeric)||numeric<0||numeric>maximum)return previous??'0';
 if((unit==='unit'||unit==='portion')&&!Number.isInteger(numeric))return previous??'0';
 // Keep the in-progress decimal text (e.g. "0.") while the user types.
 return raw;
}
function finalizeOpenBag(raw:string|undefined,size:number,unit:string):string {
 const value=Number(raw??0);
 if(!Number.isFinite(value))return '0';
 const maximum=openBagMaximum(size,unit);
 const normalized=unit==='unit'||unit==='portion'?Math.floor(value):Math.round(value*1000)/1000;
 return String(Math.min(maximum,Math.max(0,normalized)));
}


async function api(action:string,payload?:unknown,signal?:AbortSignal):Promise<Record<string,unknown>> {
 const url=`/api/pc/${action}`;
 const token=await auth?.currentUser?.getIdToken();
 if(!token)throw new Error('LOGIN_REQUIRED');
 const isRead=payload===undefined;
 for(let attempt=0;attempt<(isRead?2:1);attempt++){
  let response:Response;
  try{
   response=await fetch(url,{
    method:isRead?'GET':'POST',
    headers:{Authorization:`Bearer ${token}`,...(isRead?{}:{'Content-Type':'application/json'})},
    cache:'no-store',
    credentials:'same-origin',
    signal,
    body:isRead?undefined:JSON.stringify(payload),
   });
  }catch(error){
   if(signal?.aborted)throw new Error('TIMEOUT: la API no respondió a tiempo. Si se trataba de un guardado, comprueba Firestore o el historial ANTES de intentarlo otra vez.');
   // Retry a transient network failure once on reads only, never on writes.
   if(isRead&&attempt===0){await new Promise<void>(resolve=>setTimeout(resolve,400));continue;}
   throw new Error(`No se pudo conectar con Production Control: ${error instanceof Error?error.message:'Error de red'}. Comprueba la pestaña Network del navegador.`);
  }
  const result=await response.json().catch(()=>null) as Record<string,unknown>|null;
  if(!result){throw new Error(`La API respondió HTTP ${response.status} sin JSON válido. Revisa la terminal de Next.js.`);}
  if(!response.ok){throw new Error(`Error de la API (${response.status}): ${String(result.error||'SERVER_ERROR')}. Revisa la terminal de Next.js.`);}
  return result;
 }
 throw new Error('No se pudo cargar la información.');
}
function batchPack(b:Batch,products:Product[]){const p=products.find(row=>row.id===b.productId);return presentation({bagSize:b.bagSizeSnapshot??p?.bagSize,bagUnit:b.bagUnitSnapshot??p?.bagUnit,bagWeightKg:b.bagWeightKgSnapshot??p?.bagWeightKg});}
const quantityLabel=(value:number,unit:string)=>`${value.toLocaleString('es-CA',{maximumFractionDigits:3})} ${packUnitLabel(unit)}`;
const stamped=(v:Count['capturedAt'])=>{if(!v)return '—';const seconds=v._seconds??v.seconds;return typeof seconds==='number'?new Date(seconds*1000).toLocaleString('es-CA',{timeZone:'America/Toronto'}):'—';};
function elapsed(a:Activity|undefined,now:number){if(!a)return 0;return Math.max(0,Math.floor(a.intervals.reduce((sum,i)=>sum+(Date.parse(i.stoppedAt??new Date(now).toISOString())-Date.parse(i.startedAt)),0)/1000));}
function duration(seconds:number){return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(v=>String(v).padStart(2,'0')).join(':');}

function datetimeLocal(iso:string){
 const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toUtc(local:string){const d=new Date(local);return Number.isNaN(d.getTime())?'':d.toISOString();}
function isProduct(v:Product|Employee):v is Product{return 'kind' in v;}
function StaffButtons({items,selected,onPick,onAdd,lang}:{items:Employee[];selected:string;onPick:(v:string)=>void;onAdd:()=>void;lang:Lang}){
 const [filter,setFilter]=useState('');
 const visible=items.filter(p=>p.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
 return <div className="ux-people-picker">
  {items.length>7&&<input aria-label={lang==='es'?'Buscar persona':'Find employee'} placeholder={lang==='es'?'Buscar empleado...':'Search employees...'} value={filter} onChange={e=>setFilter(e.target.value)}/>}
  <div className="ux-people">{visible.map(p=><button key={p.id} className={selected===p.id?'ux-person chosen':'ux-person'} title={p.name} type="button" onClick={()=>onPick(p.id)}><span className="ux-person-name">{p.name}</span>{selected===p.id&&<span aria-hidden="true">✓</span>}</button>)}</div>
  {visible.length===0&&<p className="ux-muted">{lang==='es'?'No hay coincidencias':'No matching employees'}</p>}
  <button type="button" className="ux-link ux-add-person" onClick={onAdd}>+ {lang==='es'?'Agregar empleado':'Add employee'}</button>
 </div>;
}

export default function Home(){
 const [lang,setLang]=useState<Lang>('es'),[tab,setTab]=useState<Tab>('home'),[site,setSite]=useState<Site>('htl'),[data,setData]=useState<Data>(empty),[ready,setReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(()=>Date.now());
 const [date,setDate]=useState(today()),[period,setPeriod]=useState<'opening'|'closing'>('opening'),[countStep,setCountStep]=useState<'when'|'who'|'bags'|'review'>('when'),[startedBy,setStartedBy]=useState(''),[counts,setCounts]=useState<Record<string,number>>({}),[openKg,setOpenKg]=useState<Record<string,string>>({});
 const [catalogType,setCatalogType]=useState<'product'|'ingredient'|'staff'>('product'),[query,setQuery]=useState(''),[editing,setEditing]=useState<string|null>(null),[entryName,setEntryName]=useState(''),[entryWeight,setEntryWeight]=useState('5'),[entryPackUnit,setEntryPackUnit]=useState('kg'),[entryUnit,setEntryUnit]=useState('kg'),[entrySites,setEntrySites]=useState<Site[]>(['htl']),[entryActive,setEntryActive]=useState(true),[entryCountable,setEntryCountable]=useState(true),[entryProcess,setEntryProcess]=useState(''),[entryTargetDays,setEntryTargetDays]=useState('10'),[entryMinDays,setEntryMinDays]=useState('3');
 const [view,setView]=useState<View>('product'),[expanded,setExpanded]=useState<string|null>(null),[creator,setCreator]=useState(''),[productToCreate,setProductToCreate]=useState(''),[endStaff,setEndStaff]=useState<Record<string,string>>({}),[endBags,setEndBags]=useState<Record<string,string>>({}),[endPartial,setEndPartial]=useState<Record<string,string>>({}),[ingredientQuery,setIngredientQuery]=useState(''),[selectedIngredientId,setSelectedIngredientId]=useState(''),[ingredientFocused,setIngredientFocused]=useState(false),[unit,setUnit]=useState('kg'),[qty,setQty]=useState(''),[addingIngredient,setAddingIngredient]=useState(false);
 const [timerCorrection,setTimerCorrection]=useState<{batchId:string;employeeId:string;original:Array<{startedAt:string;stoppedAt:string|null}>}|null>(null);
 const [timerIntervals,setTimerIntervals]=useState<Array<{startedAt:string;stoppedAt:string;originalIndex?:number}>>([]);
 const [timerCorrector,setTimerCorrector]=useState(''),[timerReason,setTimerReason]=useState(''),[timerCorrectionError,setTimerCorrectionError]=useState('');
 const [correction,setCorrection]=useState<{type:'count'|'input'|'output';id:string}|null>(null),[correctionLines,setCorrectionLines]=useState<Record<string,number>>({}),[correctionOpen,setCorrectionOpen]=useState<Record<string,string>>({}),[correctPartial,setCorrectPartial]=useState(''),[correctQty,setCorrectQty]=useState(''),[correctUnit,setCorrectUnit]=useState('kg'),[correctEmployee,setCorrectEmployee]=useState(''),[reason,setReason]=useState(''),[correctionCode,setCorrectionCode]=useState('');
 const [adminUser,setAdminUser]=useState<User|null>(null),[isSuperAdmin,setIsSuperAdmin]=useState(false),[adminLoginOpen,setAdminLoginOpen]=useState(false),[adminEmail,setAdminEmail]=useState(''),[adminPassword,setAdminPassword]=useState(''),[adminError,setAdminError]=useState(''),[management,setManagement]=useState<ManagementData|null>(null),[managementLoading,setManagementLoading]=useState(false);
 const [loadError,setLoadError]=useState(false);
 const [kitchenAccess,setKitchenAccess]=useState<'checking'|'allowed'|'denied'>('checking');
 const [kitchenError,setKitchenError]=useState('');
 const [kitchenEmail,setKitchenEmail]=useState(''),[kitchenPassword,setKitchenPassword]=useState('');
 const [countFeedback,setCountFeedback]=useState<{kind:'error'|'success'|'warning';text:string}|null>(null);
 const countSubmitInFlight=useRef(false);
 const managementAutoLoadUid=useRef<string|null>(null);
 const [productionDate,setProductionDate]=useState(today());
 const [historyFrom,setHistoryFrom]=useState(today()),[historyTo,setHistoryTo]=useState(today()),[appliedFrom,setAppliedFrom]=useState(today()),[appliedTo,setAppliedTo]=useState(today());
 const [moveProduct,setMoveProduct]=useState(''),[moveKind,setMoveKind]=useState('foodtruck'),[moveQty,setMoveQty]=useState(''),[moveEmployee,setMoveEmployee]=useState(''),[moveNotes,setMoveNotes]=useState('');
 const t=translations[lang];
 const refresh=useCallback(async()=>{try{const r=await api(`snapshot?site=${site}&from=${appliedFrom}&to=${appliedTo}`) as unknown as Data;setData({products:r.products||[],staff:r.staff||[],counts:r.counts||[],batches:r.batches||[],activities:r.activities||[],inputs:r.inputs||[],movements:r.movements||[]});setLoadError(false);}catch(e){setLoadError(true);throw e;}},[site,appliedFrom,appliedTo]);
 const loadManagement=useCallback(async(user:User)=>{setManagementLoading(true);try{const token=await user.getIdToken();const adminTo=today(),adminFrom=dateMinus(adminTo,29);const response=await fetch(`/api/pc/management?from=${adminFrom}&to=${adminTo}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const result=await response.json() as ManagementData&{error?:string};if(!response.ok)throw new Error(result.error||String(response.status));setManagement(result);}finally{setManagementLoading(false);}},[]);
 useEffect(()=>{let preferred:Lang='es';try{if(localStorage.getItem('pc-locale')==='en')preferred='en';}catch{}const timer=window.setTimeout(()=>{setLang(preferred);setReady(true);},0);return()=>window.clearTimeout(timer);},[]);
  useEffect(()=>{
  if(!ready||kitchenAccess!=='allowed')return;
  const timer=window.setTimeout(()=>{
   void refresh().then(()=>setMessage('')).catch(e=>setMessage(String(e)));
  },0);
  return()=>window.clearTimeout(timer);
 },[ready,refresh,kitchenAccess]);
 useEffect(()=>{if(!auth)return;return onAuthStateChanged(auth,user=>{setAdminUser(user);const allowed=Boolean(user&&isSuperAdminEmail(user.email));setIsSuperAdmin(allowed);if(!allowed){managementAutoLoadUid.current=null;setManagement(null);setTab(current=>current==='management'?'home':current);}});},[]);
 useEffect(()=>{
  if(tab!=='management'||!isSuperAdmin||!adminUser||management||managementLoading)return;
  // Defer state-changing requests and avoid automatic retries on a failed request.
  if(managementAutoLoadUid.current===adminUser.uid)return;
  const timer=window.setTimeout(()=>{
   managementAutoLoadUid.current=adminUser.uid;
   void loadManagement(adminUser).catch(e=>setMessage(`${lang==='es'?'No se pudieron cargar los KPIs':'Could not load KPIs'}: ${e instanceof Error?e.message:String(e)}`));
  },0);
  return ()=>window.clearTimeout(timer);
 },[tab,isSuperAdmin,adminUser,management,managementLoading,loadManagement,lang]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  if(!adminUser){const t=window.setTimeout(()=>setKitchenAccess('denied'),0);return()=>window.clearTimeout(t);}
  let cancelled=false;
  adminUser.getIdToken().then(async token=>{
   const response=await fetch('/api/pc/access?site='+site,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const data=await response.json() as {error?:string;role?:string};
   if(!response.ok)throw new Error(data.error??'Acceso no autorizado');
   return data.role;
  }).then(role=>{if(!cancelled){setKitchenAccess('allowed');setIsSuperAdmin(role==='admin'&&isSuperAdminEmail(adminUser.email));setKitchenError('');}})
    .catch(e=>{if(!cancelled){setKitchenAccess('denied');setIsSuperAdmin(false);setData(empty);setKitchenError(e instanceof Error?e.message:'Acceso no autorizado');}});
  return()=>{cancelled=true;};
 },[adminUser,site]);
 const kitchenLogin=async()=>{
  if(!auth){setKitchenError('Firebase Authentication no está configurado.');return;}
  try{setKitchenError('');await signInWithEmailAndPassword(auth,kitchenEmail.trim(),kitchenPassword);setKitchenPassword('');}
  catch(e){setKitchenError(e instanceof Error?e.message:'No se pudo iniciar sesión');}
 };
 const adminLogin=async()=>{if(!auth){setAdminError('AUTH_NOT_CONFIGURED');return;}setAdminError('');setBusy(true);try{const credential=await signInWithEmailAndPassword(auth,adminEmail.trim(),adminPassword);if(!isSuperAdminEmail(credential.user.email)){await signOut(auth);throw new Error('SUPERADMIN_REQUIRED');}setAdminLoginOpen(false);setAdminPassword('');setTab('management');await loadManagement(credential.user);}catch(e){setAdminError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const adminLogout=async()=>{if(auth)await signOut(auth);managementAutoLoadUid.current=null;setManagement(null);setTab('home');};
 const save=async(action:string,payload:unknown,after?:()=>void)=>{setBusy(true);setMessage('');try{await api(action,payload);await refresh();after?.();setMessage(t.saved);return true;}catch(e){setMessage(`${t.error}: ${e instanceof Error?e.message:String(e)}`);return false;}finally{setBusy(false);}};
 const products=useMemo(()=>data.products.filter(p=>p.active&&p.siteIds.includes(site)),[data.products,site]);
  // A prepared product may remain producible and reusable without a daily inventory count.
  const finished=products.filter(p=>p.kind==='finished');
  const countableFinished=finished.filter(p=>p.countable!==false);
  const ingredients=products.filter(p=>p.kind==='ingredient'||(p.kind==='finished'&&p.countable===false));
 const staff=data.staff.filter(p=>p.active&&p.siteIds.includes(site));
 const batches=data.batches.filter(b=>b.siteId===site&&(b.status==='active'||b.operationalDate>=appliedFrom&&b.operationalDate<=appliedTo)).sort((a,b)=>b.operationalDate.localeCompare(a.operationalDate));
 const history=data.counts.filter(c=>c.siteId===site).sort((a,b)=>b.operationalDate.localeCompare(a.operationalDate));
 const existingCount=history.find(c=>c.operationalDate===date&&c.period===period);
 const groupedCounts=Array.from({length:Math.floor((Date.parse(appliedTo+'T12:00:00Z')-Date.parse(appliedFrom+'T12:00:00Z'))/86400000)+1},(_,i)=>dateMinus(appliedTo,i)).map(day=>({day,opening:history.find(c=>c.operationalDate===day&&c.period==='opening'),closing:history.find(c=>c.operationalDate===day&&c.period==='closing')}));
 const changeSite=(next:Site)=>{setSite(next);setEntrySites([next]);resetCount();setExpanded('');setEditing(null);setTab('home');};
 const openAddEmployee=()=>{prepareCatalog('staff');setTab('catalog');};
 const employeeName=(id:string)=>staff.find(p=>p.id===id)?.name??id;
 const resetCount=()=>{setCountStep('when');setStartedBy('');setCounts({});setOpenKg({});};
 const startNewCount=()=>{resetCount();setCountFeedback(null);};
 const countTotals={bags:countableFinished.reduce((s,p)=>s+(counts[p.id]??0),0),summary:PACK_UNITS.map(u=>({unit:u.id,amount:countableFinished.filter(p=>presentation(p).bagUnit===u.id).reduce((sum,p)=>{const pack=presentation(p);return sum+productQuantity(counts[p.id]??0,Number(openKg[p.id]??0),pack.bagSize);},0)})).filter(x=>x.amount>0).map(x=>quantityLabel(x.amount,x.unit)).join(' · ')||'0'};
 // Validate against the server rules and explain which product prevents saving.
 // A count with zero inventory IS valid; openAmount is only for part of ONE bag.
 const countProblem=(()=>{
  if(!startedBy)return lang==='es'?'Selecciona quién inició el conteo.':'Choose who started the count.';
  if(existingCount)return lang==='es'?'Este conteo ya existe. Usa Corregir con autorización del encargado.':'This count already exists. Use the authorized correction action.';
  if(!countableFinished.length)return lang==='es'?'No hay productos marcados para conteo en esta sucursal.':'There are no active countable finished products in this location.';
  if(countableFinished.length>100)return lang==='es'?'Hay más de 100 productos activos. El servidor admite un máximo de 100 líneas por conteo.':'There are more than 100 active products; the server supports up to 100 count lines.';
  for(const product of countableFinished){
   const pack=presentation(product);
   if(!Number.isFinite(pack.bagSize)||pack.bagSize<=0||pack.bagSize>100000)return lang==='es'?`Catálogo: revisa la presentación de «${product.name}». Debe ser mayor que cero.`:`Catalog: check the bag size for “${product.name}”. It must be greater than zero.`;
   const bags=counts[product.id]??0;
   if(!Number.isSafeInteger(bags)||bags<0||bags>100000)return lang==='es'?`Revisa las bolsas de «${product.name}» (número entero entre 0 y 100000).`:`Check the number of bags for “${product.name}” (whole number from 0 to 100000).`;
   const raw=openKg[product.id]??'0',partial=raw.trim()===''?0:Number(raw);
   if(!Number.isFinite(partial)||partial<0)return lang==='es'?`Revisa la cantidad de bolsa abierta de «${product.name}».`:`Check the open bag amount for “${product.name}”.`;
   if(partial>openBagMaximum(pack.bagSize,pack.bagUnit))return lang==='es'?`«${product.name}»: la bolsa abierta (${partial} ${packUnitLabel(pack.bagUnit)}) debe contener menos de ${pack.bagSize} ${packUnitLabel(pack.bagUnit)}. Si está completa, súmala a «Bolsas» y deja «Abierta» en 0.`:`“${product.name}”: the open bag (${partial} ${packUnitLabel(pack.bagUnit)}) must be smaller than ${pack.bagSize}. Count a full bag under “Bags” and set “Open” to 0.`;
  }
  return '';
 })();
 const submitCount=async()=>{
  if(countSubmitInFlight.current)return;
  if(countProblem){setCountFeedback({kind:'error',text:countProblem});return;}
  const targetSite=site,targetDate=date,targetPeriod=period;
  const id=`${targetSite}_${targetDate}_${targetPeriod}`;
  const payload={siteId:targetSite,operationalDate:targetDate,period:targetPeriod,startedById:startedBy,signedById:startedBy,
   confirmDifferentSigner:false,
   lines:countableFinished.map(p=>({productId:p.id,bagCount:counts[p.id]??0,openAmount:Number(finalizeOpenBag(openKg[p.id],presentation(p).bagSize,presentation(p).bagUnit))}))};
  countSubmitInFlight.current=true;
  setBusy(true);setCountFeedback(null);setMessage('');
  let confirmedByWrite=false;
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),30000);
  try{
   const result=await api('count',payload,controller.signal);
   if(result.ok!==true||result.id!==id)throw new Error('La API no confirmó el identificador del conteo.');
   confirmedByWrite=true;
   window.clearTimeout(timeout);
   // The write was acknowledged. Never repeat the POST just because this read fails.
   resetCount();
   setHistoryFrom(targetDate);setHistoryTo(targetDate);
   setAppliedFrom(targetDate);setAppliedTo(targetDate);
   setCountFeedback({kind:'success',text:lang==='es'?`Conteo guardado en Firestore: ${id}.`: `Count saved in Firestore: ${id}.`});
   // Confirm success immediately, before the secondary refresh (which can fail independently).
   setBusy(false);
   document.querySelector('.ux-count')?.scrollIntoView({behavior:'smooth',block:'start'});
   const verifyController=new AbortController();
   const verifyTimeout=window.setTimeout(()=>verifyController.abort(),12000);
   try{
    const checked=await api(`snapshot?site=${targetSite}&from=${targetDate}&to=${targetDate}`,undefined,verifyController.signal) as unknown as Data;
    const saved=(checked.counts??[]).find(c=>c.id===id);
    if(saved){
     setData(previous=>({...previous,counts:[...previous.counts.filter(c=>c.id!==id),saved]}));
    }else{
     setCountFeedback({kind:'warning',text:lang==='es'?`El servidor confirmó la escritura (${id}), pero la consulta posterior aún no devuelve el registro. No lo vuelvas a capturar; consulta Firestore o actualiza el historial.`:`The server acknowledged the write (${id}), but the follow-up query did not show it. Do not submit it twice; check Firestore or refresh history.`});
    }
   }catch{
    setCountFeedback({kind:'warning',text:lang==='es'?`El servidor confirmó que guardó ${id}, pero no se pudo actualizar el historial. NO repitas el guardado; utiliza «Consultar periodo» para comprobarlo.`:`The server confirmed ${id} was saved, but history could not reload. Do NOT submit it again; use “Consult period” to verify.`});
   }finally{window.clearTimeout(verifyTimeout);}
  }catch(error){
   const detail=error instanceof Error?error.message:String(error);
   const conflict=detail.includes('CONFLICT')||detail.includes('(409)');
   setCountFeedback({kind:'error',text:conflict?(lang==='es'?`Ya existe un conteo para ${targetDate} (${targetPeriod==='opening'?'apertura':'cierre'}). No se sobrescribió. Consulta ese periodo y utiliza «Corregir» si es necesario.`:`A count already exists for ${targetDate}. Use the authorized correction action.`):(lang==='es'?`No se confirmó el guardado: ${detail}. Antes de intentarlo otra vez, comprueba el día en Firestore para evitar duplicados.`:`Save was not confirmed: ${detail}. Before retrying, check Firestore to avoid duplicate submissions.`)});
   if(confirmedByWrite){
    setCountFeedback({kind:'warning',text:lang==='es'?`El servidor confirmó ${id}, aunque hubo un problema posterior. No lo guardes otra vez.`:`The server confirmed ${id}, although a later step failed. Do not save again.`});
   }
  }finally{window.clearTimeout(timeout);countSubmitInFlight.current=false;setBusy(false);}
 };

 const prepareCatalog=(kind:'product'|'ingredient'|'staff',item?:Product|Employee)=>{setCatalogType(kind);setEditing(item?.id??'new');setEntryName(item?.name??'');setEntrySites(item?.siteIds??[site]);setEntryActive(item?.active??true);setEntryCountable(item&&isProduct(item)?item.countable!==false:true);if(item&&isProduct(item)){setEntryWeight(String(presentation(item).bagSize||5));setEntryPackUnit(presentation(item).bagUnit);setEntryUnit(item.defaultUnit??'kg');setEntryProcess(item.preparationProcess??'');setEntryTargetDays(String(item.targetDays??10));setEntryMinDays(String(item.minDays??3));}else{setEntryWeight('5');setEntryPackUnit('kg');setEntryUnit('kg');setEntryProcess('');setEntryTargetDays('10');setEntryMinDays('3');}};
 const submitCatalog=async()=>{const common={siteId:site,kind:catalogType==='staff'?'staff':'product',id:editing==='new'?undefined:editing,name:catalogType==='ingredient'?entryName.trim().toUpperCase():entryName.trim(),siteIds:editing==='new'?[site]:entrySites,active:entryActive};await save('catalog',catalogType==='staff'?common:{...common,productKind:catalogType==='ingredient'?'ingredient':'finished',bagSize:catalogType==='ingredient'?null:(entryCountable?Number(entryWeight):(editing==='new'?1:(Number(entryWeight)||1))),bagUnit:catalogType==='ingredient'?null:entryPackUnit,defaultUnit:catalogType==='ingredient'?entryUnit:null,countable:catalogType==='product'?entryCountable:false,preparationProcess:entryProcess,targetDays:Number(entryTargetDays),minDays:Number(entryMinDays)},()=>setEditing(null));};
 const openCorrection=(type:'count'|'input'|'output',id:string)=>{setCorrection({type,id});setReason('');setCorrectEmployee('');setCorrectionCode('');const count=data.counts.find(c=>c.id===id);if(type==='count'&&count){setCorrectionLines(Object.fromEntries(count.lines.map(l=>[l.productId,l.bagCount])));setCorrectionOpen(Object.fromEntries(count.lines.map(l=>[l.productId,String(l.openAmount??l.openKg??0)])));}const input=data.inputs.find(i=>i.id===id);if(type==='input'&&input){setCorrectQty(String(input.quantity));setCorrectUnit(input.unit);}const batch=data.batches.find(b=>b.id===id);if(type==='output'&&batch){setCorrectQty(String(batch.countableSnapshot===false?(batch.outputAmount??0):(batch.bagCount??0)));setCorrectPartial(String(batch.partialAmount??batch.partialKg??0));}};
 const submitCorrection=async()=>{if(!correction||reason.trim().length<5||!correctEmployee)return;const employeeId=correctEmployee;const verificationCode=correctionCode;if(correction.type==='count'){const c=data.counts.find(x=>x.id===correction.id);if(!c)return;await save('count-correct',{countId:c.id,employeeId,reason,verificationCode,lines:c.lines.map(l=>({productId:l.productId,bagCount:correctionLines[l.productId]??l.bagCount,openAmount:Number(correctionOpen[l.productId]??l.openAmount??l.openKg??0)}))},()=>setCorrection(null));}else if(correction.type==='input'){await save('input-correct',{inputId:correction.id,employeeId,reason,verificationCode,quantity:Number(correctQty),unit:correctUnit},()=>setCorrection(null));}else{const correctedBatch=data.batches.find(b=>b.id===correction.id);await save('output-correct',correctedBatch?.countableSnapshot===false?{batchId:correction.id,employeeId,reason,verificationCode,outputAmount:Number(correctQty)}:{batchId:correction.id,employeeId,reason,verificationCode,bagCount:Number(correctQty),partialAmount:Number(correctPartial)},()=>setCorrection(null));}};
 const openTimerCorrection=(batchId:string,employeeId:string)=>{
  const old=data.activities.find(a=>a.batchId===batchId&&a.employeeId===employeeId);
  const original=(old?.intervals??[]).map(v=>({...v}));
  setTimerCorrection({batchId,employeeId,original});
  // If this employee never started a timer, provide editable fields immediately.
  setTimerIntervals(original.length
   ? original.map((i,index)=>({startedAt:datetimeLocal(i.startedAt),stoppedAt:i.stoppedAt?datetimeLocal(i.stoppedAt):'',originalIndex:index}))
   : [{startedAt:'',stoppedAt:''}]);
  setTimerCorrector(employeeId);setCorrectionCode('');setTimerReason('');setTimerCorrectionError('');
 };
 const selectTimerWorker=(employeeId:string)=>{if(timerCorrection)openTimerCorrection(timerCorrection.batchId,employeeId);};
 const timerTimesValid=Boolean(timerCorrection&&(timerIntervals.length>0||timerCorrection.original.length>0)&&timerIntervals.every((v,i)=>{
  const start=Date.parse(v.startedAt),end=v.stoppedAt?Date.parse(v.stoppedAt):null;
  if(!Number.isFinite(start)||start>now||end!==null&&(!Number.isFinite(end)||end<=start||end>now))return false;
  if(end===null&&(i!==timerIntervals.length-1||data.batches.find(b=>b.id===timerCorrection.batchId)?.status!=='active'))return false;
  if(i>0){const prev=timerIntervals[i-1];const prevEnd=Date.parse(prev.stoppedAt);if(!prev.stoppedAt||!Number.isFinite(prevEnd)||start<prevEnd)return false;}
  return true;
 }));
 const submitTimerCorrection=async()=>{
  if(!timerCorrection)return;
  if(!timerIntervals.length&&!timerCorrection.original.length){setTimerCorrectionError('Este empleado no tiene intervalos guardados para eliminar.');return;}
  if(!timerTimesValid){setTimerCorrectionError('Indica horas válidas: inicio anterior al fin, sin fechas futuras ni intervalos superpuestos. Si el lote está terminado, indica también la hora de fin.');return;}
  if(!timerCorrector){setTimerCorrectionError('Selecciona quién realiza la corrección.');return;}
  if(!timerReason.trim()){setTimerCorrectionError('Escribe brevemente por qué corriges el tiempo.');return;}
  setTimerCorrectionError('');setBusy(true);
  try{
   await api('timer-correct',{
    batchId:timerCorrection.batchId,workEmployeeId:timerCorrection.employeeId,employeeId:timerCorrector,
    reason:timerReason.trim(),verificationCode:correctionCode,originalIntervals:timerCorrection.original,
    intervals:timerIntervals.map(v=>{const prior=v.originalIndex===undefined?undefined:timerCorrection.original[v.originalIndex];return {startedAt:prior&&datetimeLocal(prior.startedAt)===v.startedAt?prior.startedAt:toUtc(v.startedAt),stoppedAt:v.stoppedAt?(prior?.stoppedAt&&datetimeLocal(prior.stoppedAt)===v.stoppedAt?prior.stoppedAt:toUtc(v.stoppedAt)):null};})
   });
   setTimerCorrection(null);setMessage('Tiempo corregido correctamente.');
   try{await refresh();}catch(e){setMessage(`Se guardó la corrección, pero no se pudo actualizar la pantalla: ${String(e)}. Pulsa Actualizar.`);}
  }catch(e){setTimerCorrectionError(`No se pudo guardar: ${e instanceof Error?e.message:String(e)}`);}
  finally{setBusy(false);}
 };
 const startIngredient=async()=>{const name=ingredientQuery.trim().toUpperCase();if(name.length<2)return;await save('catalog',{siteId:site,kind:'product',productKind:'ingredient',name,siteIds:[site],active:true,category:'other',defaultUnit:unit},()=>setAddingIngredient(false));};
 function finishPanel(batch:Batch,workerId?:string){
  if(batch.status!=='active')return null;
  const pack=batchPack(batch,data.products);
  const selected=endStaff[batch.id]??workerId??batch.createdById??'';
  const direct=batch.countableSnapshot===false;
  const bags=Number(endBags[batch.id]??0),partial=Number(endPartial[batch.id]??0);
  const output=direct?Number(endBags[batch.id]??0):productQuantity(bags,partial,pack.bagSize);
  const running=data.activities.filter(a=>a.batchId===batch.id&&a.running);
  const valid=Boolean(selected&&(direct?(Number.isFinite(output)&&output>0&&output<=100000&&Math.round(output*1000)/1000===output):(Number.isSafeInteger(bags)&&bags>=0&&Number.isFinite(partial)&&partial>=0&&partial<pack.bagSize&&output>0)));
  return <div className="ux-finish-row pc-finish-panel">
   <h3>{lang==='es'?'Resultado final':'Final output'} · {batch.productName}</h3>
   <label>{t.worker}<select value={selected} onChange={e=>setEndStaff(v=>({...v,[batch.id]:e.target.value}))}><option value="">—</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {direct?<label>{lang==='es'?`Cantidad producida (${packUnitLabel(pack.bagUnit)})`:`Produced quantity (${packUnitLabel(pack.bagUnit)})`}<input value={endBags[batch.id]??''} type="number" inputMode="decimal" min="0.001" max="100000" step="0.001" onChange={e=>setEndBags(v=>({...v,[batch.id]:e.target.value}))}/></label>:<><label>Bolsas completas<input value={endBags[batch.id]??''} type="number" inputMode="numeric" min="0" step="1" onChange={e=>setEndBags(v=>({...v,[batch.id]:e.target.value}))}/></label>
   <label>Contenido adicional ({packUnitLabel(pack.bagUnit)})<input value={endPartial[batch.id]??'0'} type="number" inputMode="decimal" min="0" max={pack.bagSize} step="any" onChange={e=>setEndPartial(v=>({...v,[batch.id]:e.target.value}))}/></label></>}
   <span className="ux-inline-total">Total: <strong>{quantityLabel(output,pack.bagUnit)}</strong></span>
   {running.length>0&&<p className="pc-full-row ux-warning">Primero pausa el cronómetro de: {running.map(x=>x.employeeName).join(', ')}.</p>}
   <button type="button" className="ux-main-button" disabled={busy||!valid||running.length>0} onClick={()=>void save('finish',direct?{batchId:batch.id,employeeId:selected,outputAmount:output}:{batchId:batch.id,employeeId:selected,bagCount:bags,partialAmount:partial})}>{t.finish}</button>
   {!valid&&<small className="pc-full-row">Selecciona al responsable e indica una producción final mayor que cero.</small>}
  </div>;
 }
 function ingredientPanel(batch:Batch,person:Employee){const key=`${batch.id}:${person.id}`;const open=expanded===key;const activity=data.activities.find(a=>a.batchId===batch.id&&a.employeeId===person.id);const added=data.inputs.filter(i=>i.batchId===batch.id&&i.employeeId===person.id);const search=ingredientQuery.trim().toUpperCase(),choices=ingredients.filter(i=>i.id!==batch.productId),matches=search?choices.filter(i=>i.name.toUpperCase().includes(search)).slice(0,7):[];const exactMatches=choices.filter(i=>i.name.toUpperCase()===search);const exact=selectedIngredientId?choices.find(i=>i.id===selectedIngredientId&&i.name.toUpperCase()===search):(exactMatches.length===1?exactMatches[0]:undefined);
 return <div className="ux-task" key={key}><button type="button" className="ux-task-head" aria-expanded={open} onClick={()=>{setExpanded(open?'':key);setIngredientQuery('');setSelectedIngredientId('');setIngredientFocused(false);setAddingIngredient(false);setQty('');}}><strong>{view==='product'?person.name:batch.productName}</strong><span>{duration(elapsed(activity,now))} <b>{open?'−':'+'}</b></span></button>{open&&<div className="ux-task-body"><div className="ux-pair">{batch.productName} → {person.name}</div><div className="ux-worktime">{duration(elapsed(activity,now))}</div><button type="button" className="ux-link ux-timer-correct" disabled={busy} onClick={()=>openTimerCorrection(batch.id,person.id)}>{lang==='es'?'Corregir tiempo':'Correct time'}</button>{batch.status==='active'&&<><button className={activity?.running?'ux-pause':'ux-main-button'} disabled={busy} onClick={()=>void save(activity?.running?'pause':'start',{batchId:batch.id,employeeId:person.id})}>{activity?.running?'Ⅱ '+t.pause:'▶ '+t.start}</button><div className="ux-ingredient-fields"><div className="ux-autocomplete"><label>{t.ingredient}<input autoComplete="off" value={ingredientQuery} placeholder={t.searchIngredient} onFocus={()=>setIngredientFocused(true)} onBlur={()=>window.setTimeout(()=>setIngredientFocused(false),120)} onChange={e=>{setIngredientQuery(e.target.value.toUpperCase());setSelectedIngredientId('');setAddingIngredient(false);const found=choices.filter(i=>i.name.toUpperCase()===e.target.value.toUpperCase().trim());if(found.length===1){const match=found[0];setUnit(match.kind==='finished'?(match.bagUnit??'kg'):(match.defaultUnit??'kg'));}}}/></label>{search&&ingredientFocused&&<div className="ux-suggestions">{matches.map(i=><button type="button" key={i.id} onClick={()=>{setIngredientQuery(i.name);setSelectedIngredientId(i.id);setIngredientFocused(false);setUnit(i.kind==='finished'?(i.bagUnit??'kg'):(i.defaultUnit??'kg'));setAddingIngredient(false);}}>{i.name} {i.kind==='finished'?'· '+(lang==='es'?'Preparación':'Preparation'):''}</button>)}{exactMatches.length===0&&search.length>=2&&<button type="button" onClick={()=>setAddingIngredient(true)}>+ {t.addNew}: {search}</button>}</div>}</div><label>{t.amount}<input type="number" min="0.001" step="any" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>{t.unit}<select value={unit} onChange={e=>setUnit(e.target.value)}>{PC_UNITS.map(u=><option key={u.id} value={u.id}>{lang==='es'?u.es:u.en}</option>)}</select></label></div>{addingIngredient&&!exact&&<div className="ux-subform"><strong>{t.addNew}: {search}</strong><button className="ux-secondary" disabled={busy} onClick={()=>void startIngredient()}>{t.saveCatalog}</button></div>}{exact&&Number(qty)>0&&<div className="ux-input-preview"><strong>{Number(qty)} {unit} · {exact.name}</strong><span>→ {batch.productName} · {person.name}</span></div>}<button className="ux-secondary ux-full" disabled={busy||!exact||!(Number(qty)>0)} onClick={()=>{if(exact)void save('input',{batchId:batch.id,employeeId:person.id,ingredientId:exact.id,quantity:Number(qty),unit},()=>{setQty('');setIngredientQuery('');setSelectedIngredientId('');setIngredientFocused(false);});}}>+ {t.record}</button></>}{added.length>0&&<div className="ux-records"><strong>{t.labelInput}</strong>{added.map(i=><div className="ux-record" key={i.id}><span>{i.ingredientName}</span><b>{i.quantity} {i.unit}</b><button className="ux-link" onClick={()=>openCorrection('input',i.id)}>{t.correct}</button></div>)}</div>}</div>}</div>;
 }

 const activeBatches=batches.filter(b=>b.status==='active');
 const todaysActive=activeBatches.filter(b=>b.operationalDate===today());
 const olderActive=activeBatches.filter(b=>b.operationalDate!==today());
 const completedBatches=batches.filter(b=>b.status==='completed');
 const completedDays=Array.from(new Set(completedBatches.map(b=>b.operationalDate)));
 const participated=(b:Batch,employeeId:string)=>Boolean(b.createdById===employeeId||data.activities.some(a=>a.batchId===b.id&&a.employeeId===employeeId)||data.inputs.some(i=>i.batchId===b.id&&i.employeeId===employeeId));
 const addParticipant=(batchId:string,employeeId:string)=>{if(!employeeId)return;setExpanded(`${batchId}:${employeeId}`);setIngredientQuery('');setSelectedIngredientId('');setIngredientFocused(false);setAddingIngredient(false);setQty('');};
 function activeProductCard(b:Batch){
  const participants=staff.filter(p=>participated(b,p.id)||expanded===`${b.id}:${p.id}`);
  const remaining=staff.filter(p=>!participants.some(selected=>selected.id===p.id));
  return <article className="ux-batch pc-active-card" key={b.id}>
   <div className="ux-batch-head"><div><h2>{b.productName}</h2><small>{b.operationalDate} · {b.operationalDate===today()?t.running:(lang==='es'?'Pendiente de otro día':'Pending from previous date')}</small></div><button className="ux-link" disabled={busy||!staff.length} onClick={()=>openTimerCorrection(b.id,staff.find(p=>p.id===b.createdById)?.id??staff[0].id)}>{lang==='es'?'Corregir cronómetro':'Correct timer'}</button></div>
   {b.processSnapshot&&<details className="ux-process pc-process-collapsed"><summary>{lang==='es'?'Proceso de preparación':'Preparation steps'}</summary><p>{b.processSnapshot}</p></details>}
   <div className="pc-participant-list">{participants.map(p=>ingredientPanel(b,p))}</div>
   {remaining.length>0&&<label className="pc-add-participant">{lang==='es'?'+ Agregar participante':'+ Add participant'}<select value="" onChange={e=>addParticipant(b.id,e.target.value)}><option value="">{lang==='es'?'Seleccionar persona…':'Select employee…'}</option>{remaining.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   {finishPanel(b)}
  </article>;
 }
 function completedProductDay(day:string){
  const dayBatches=completedBatches.filter(b=>b.operationalDate===day);
  return <details className="pc-day-production pc-completed-day" key={day}><summary><strong>{day}</strong><span>{dayBatches.length} {lang==='es'?'preparaciones finalizadas':'completed preparations'}</span></summary>
   <div className="pc-completed-day-body">{dayBatches.map(b=><details className="pc-closed-batch" key={b.id}><summary><strong>{b.productName}</strong><span>{b.countableSnapshot===false?'':`${b.bagCount??0} ${t.bags} · `}{quantityLabel(b.outputAmount??b.outputKg??0,b.outputUnit??b.bagUnitSnapshot??'kg')}</span></summary>
    <div className="pc-completed-details"><small>{lang==='es'?'Inició':'Started by'}: {b.createdByName} · {b.operationalDate}</small>
    <details className="ux-process"><summary>{lang==='es'?'Ingredientes registrados':'Recorded ingredients'} ({data.inputs.filter(i=>i.batchId===b.id).length})</summary>{data.inputs.filter(i=>i.batchId===b.id).map(i=><div key={i.id}>{i.ingredientName}: {i.quantity} {i.unit}</div>)}</details>
    {staff.filter(p=>data.activities.some(a=>a.batchId===b.id&&a.employeeId===p.id)).map(p=>ingredientPanel(b,p))}
    <div className="pc-completed-actions"><button className="ux-link" onClick={()=>openCorrection('output',b.id)}>{t.fixOutput}</button><button className="ux-link" disabled={!staff.length} onClick={()=>openTimerCorrection(b.id,staff.find(p=>p.id===b.createdById)?.id??staff[0].id)}>{lang==='es'?'Corregir cronómetro':'Correct timer'}</button></div></div>
   </details>)}</div>
  </details>;
 }
 if(!ready||kitchenAccess==='checking')return <main className="ux-loading">Cargando acceso seguro…</main>;
 if(kitchenAccess!=='allowed')return <main className="ux-loading" style={{display:'grid',placeItems:'center',padding:20}}>
   <section style={{maxWidth:400,width:'100%',padding:24,background:'white',borderRadius:16,display:'grid',gap:12}}>
   <h1>Producción y Conteos</h1><p>Acceso exclusivo para personal de cocina autorizado. Compras y Control operativo tienen accesos separados.</p>
   <label>Sucursal<select value={site} onChange={e=>{setKitchenAccess('checking');changeSite(e.target.value as Site);}}>{locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   {adminUser?<><p>Sesión: {adminUser.email}</p><p role="alert">{kitchenError}</p><button onClick={()=>void signOut(auth!)}>Cambiar de cuenta</button></>:
    <><label>Correo electrónico<input type="email" value={kitchenEmail} onChange={e=>setKitchenEmail(e.target.value)}/></label>
    <label>Contraseña<input type="password" value={kitchenPassword} onChange={e=>setKitchenPassword(e.target.value)}/></label>
    <button disabled={!kitchenEmail||!kitchenPassword} onClick={()=>void kitchenLogin()}>Iniciar sesión</button>
    {kitchenError&&<p role="alert">{kitchenError}</p>}</>}
   </section></main>;
 return <div className="ux-app"><header className="ux-header"><button className="ux-logo" onClick={()=>setTab('home')}>BT <span>Production Control</span></button><div className="ux-settings"><select className="ux-branch-label" aria-label={t.branch} value={site} onChange={e=>changeSite(e.target.value as Site)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name.toUpperCase()} · {l.id.toUpperCase()}</option>)}</select>{isSuperAdmin&&<><a className="pc-consulta-link" href="/consulta">Consulta</a><a className="pc-consulta-link" href="/compras">Compras</a><a className="pc-consulta-link" href="/control-operativo">Control operativo</a><a className="pc-consulta-link" href="/operations">Administración general</a></>}<button type="button" className="ux-admin-button" onClick={()=>{if(isSuperAdmin)setTab('management');else{setAdminError('');setAdminLoginOpen(true);}}}>{isSuperAdmin?(lang==='es'?'KPIs':'KPIs'):(lang==='es'?'Management':'Management')}</button><label>{t.lang}<select value={lang} onChange={e=>{const v=e.target.value as Lang;setLang(v);try{localStorage.setItem('pc-locale',v);}catch{}}}><option value="es">Español</option><option value="en">English</option></select></label></div></header><nav className="ux-nav"><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}>{t.home}</button><button className={tab==='counts'?'active':''} onClick={()=>setTab('counts')}>{t.count}</button><button className={tab==='production'?'active':''} onClick={()=>setTab('production')}>{t.myWork}</button><button className={tab==='catalog'?'active':''} onClick={()=>setTab('catalog')}>{t.manage}</button>{isSuperAdmin&&<button className={tab==='management'?'active':''} onClick={()=>setTab('management')}>KPIs</button>}</nav> <main className="ux-main">{message&&<div className="ux-message" role="status"><span>{message}</span><div className="ux-message-actions">{loadError&&<button type="button" className="ux-retry" onClick={()=>void refresh().then(()=>setMessage('')).catch(e=>setMessage(String(e)))}>{lang==='es'?'↻ Reintentar carga':'↻ Retry loading'}</button>}<button type="button" aria-label={lang==='es'?'Cerrar mensaje':'Dismiss message'} onClick={()=>setMessage('')}>×</button></div></div>}
 {tab==='home'&&<section className="ux-welcome"><p className="ux-eyebrow">HOT TACOS · {locations.find(l=>l.id===site)?.name}</p><h1>{t.hello}</h1><p className="ux-muted">{t.subtitle}</p><div className="ux-tiles"><button onClick={()=>{startNewCount();setTab('counts');}}><span className="ux-tile-icon">▤</span><strong>{t.count}</strong><small>{t.countDesc}</small><span className="ux-arrow">→</span></button><button onClick={()=>setTab('production')}><span className="ux-tile-icon">◷</span><strong>{t.cook}</strong><small>{t.cookDesc}</small><span className="ux-arrow">→</span></button></div><button className="ux-manage-link" onClick={()=>setTab('catalog')}>⚙ {t.manage} · {t.manageDesc} →</button></section>}
 {tab==='counts'&&<section className="ux-count"><div className="ux-section-head"><div><p className="ux-eyebrow">{t.count}</p><h1>{countStep==='when'?t.when:countStep==='who'?t.who:countStep==='bags'?t.countProducts:(lang==='es'?'Revisar y guardar':'Review and save')}</h1></div><button className="ux-secondary" onClick={startNewCount}>{t.cancel}</button></div>
 {countFeedback&&countStep!=='review'&&<div role="status" aria-live="polite" className={`pc-count-feedback pc-count-feedback-${countFeedback.kind}`}><strong>{countFeedback.kind==='success'?'✓ ':countFeedback.kind==='warning'?'⚠ ':'! '}{countFeedback.kind==='success'?(lang==='es'?'Guardado confirmado':'Save confirmed'):countFeedback.kind==='warning'?(lang==='es'?'Verificación pendiente':'Verification pending'):(lang==='es'?'Revisa el conteo':'Review count')}</strong><p>{countFeedback.text}</p></div>}
 {countStep==='when'&&<div className="ux-paper"><div className="ux-big-choices"><button className={period==='opening'?'selected':''} onClick={()=>setPeriod('opening')}><span>☀</span><strong>{t.opening}</strong></button><button className={period==='closing'?'selected':''} onClick={()=>setPeriod('closing')}><span>☾</span><strong>{t.closing}</strong></button></div><label className="ux-date-label">{t.date}<input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label>{existingCount&&<div className="ux-duplicate"><strong>{lang==='es'?'Ya se registró este conteo.':'This count is already recorded.'}</strong><span>{existingCount.startedByName} → {existingCount.signedByName} · {existingCount.lines.reduce((sum,line)=>sum+line.bagCount,0)} {t.bags}</span><button className="ux-secondary" type="button" onClick={()=>openCorrection('count',existingCount.id)}>{lang==='es'?'Ver / corregir registro':'View / correct count'}</button></div>}<button className="ux-main-button" disabled={!finished.length||!staff.length||Boolean(existingCount)} onClick={()=>setCountStep('who')}>{t.next} →</button>{!finished.length&&<p className="ux-muted">{t.noProducts}</p>}{!staff.length&&<p className="ux-muted">{t.noStaff}</p>}</div>}
 {countStep==='who'&&<div className="ux-paper"><p className="ux-muted">{t.choose}</p><StaffButtons items={staff} selected={startedBy} onPick={setStartedBy} onAdd={openAddEmployee} lang={lang}/><div className="ux-bottom"><button className="ux-secondary" onClick={()=>setCountStep('when')}>{t.back}</button><button className="ux-main-button" disabled={!startedBy} onClick={()=>setCountStep('bags')}>{t.next} →</button></div></div>}
 {countStep==='bags'&&<div className="ux-paper pc-count-paper">
  <div className="ux-context">{date} · {period==='opening'?t.opening:t.closing} · {employeeName(startedBy)}</div>
  <div className="pc-count-head" aria-hidden="true"><span>{t.product}</span><span>{t.bags}</span><span>{lang==='es'?'Bolsa abierta (< 1 bolsa)':'Open bag (< 1 bag)'}</span><span>{t.total}</span></div>
  <div className="ux-bag-list pc-count-table">{countableFinished.map(p=>{
   const pack=presentation(p);
   return <div className="ux-bag-row pc-count-row" key={p.id}>
    <div className="ux-bag-name"><strong>{p.name}</strong><small>{pack.bagSize} {packUnitLabel(pack.bagUnit)}/{t.bags}</small></div>
    <div className="ux-stepper"><button type="button" aria-label={`${lang==='es'?'Restar':'Subtract'} ${p.name}`} onClick={()=>setCounts(q=>({...q,[p.id]:Math.max(0,(q[p.id]??0)-1)}))}>−</button><input type="number" min="0" step="1" inputMode="numeric" aria-label={`${p.name}: ${t.bags}`} value={counts[p.id]??0} onChange={e=>setCounts(q=>({...q,[p.id]:Math.max(0,Math.floor(Number(e.target.value)||0))}))}/><button type="button" aria-label={`${lang==='es'?'Agregar':'Add'} ${p.name}`} onClick={()=>setCounts(q=>({...q,[p.id]:(q[p.id]??0)+1}))}>+</button></div>
    <label className="ux-partial pc-count-open"><span>{lang==='es'?'Abierta':'Open'} (&lt; {pack.bagSize} {packUnitLabel(pack.bagUnit)})</span><input aria-label={`${p.name}: ${lang==='es'?'contenido de bolsa abierta':'open bag contents'} (${packUnitLabel(pack.bagUnit)})`} type="number" inputMode="decimal" min="0" max={openBagMaximum(pack.bagSize,pack.bagUnit)} step={openBagIncrement(pack.bagSize,pack.bagUnit)} value={openKg[p.id]??'0'} onChange={e=>setOpenKg(v=>({...v,[p.id]:normalizeOpenBag(e.target.value,v[p.id],pack.bagSize,pack.bagUnit)}))} onBlur={()=>setOpenKg(v=>({...v,[p.id]:finalizeOpenBag(v[p.id],pack.bagSize,pack.bagUnit)}))}/></label>
    <b className="pc-count-amount">{quantityLabel(productQuantity(counts[p.id]??0,Number(openKg[p.id]??0),pack.bagSize),pack.bagUnit)}</b>
   </div>;
  })}</div>
  <div className="ux-total pc-count-total"><span>{countTotals.bags} {t.bags}</span><strong>{countTotals.summary}</strong></div>
  <div className="ux-bottom"><button className="ux-secondary" onClick={()=>setCountStep('who')}>{t.back}</button><button className="ux-main-button" onClick={()=>setCountStep('review')}>{t.review} →</button></div>
 </div>}
 {countStep==='review'&&<div className="ux-paper">
  <div className="ux-review"><b>{date} · {period==='opening'?t.opening:t.closing}</b><strong>{countTotals.bags} {t.bags} · {countTotals.summary}</strong><span>{t.remember}</span></div>
  <p className="ux-muted">{lang==='es'?'Responsable del conteo:':'Counted by:'} <strong>{employeeName(startedBy)}</strong>. {lang==='es'?'Guardar concluye el conteo; no requiere otra firma ni acceso.':'Saving completes the count; no additional signature or login is needed.'}</p>
  {countProblem&&<p className="pc-count-validation" role="alert">{countProblem}</p>}
  {countFeedback&&<div role="status" aria-live="polite" className={`pc-count-feedback pc-count-feedback-${countFeedback.kind}`}><strong>{countFeedback.kind==='error'?(lang==='es'?'No se pudo confirmar el guardado':'Could not confirm save'):(lang==='es'?'Aviso del servidor':'Server notice')}</strong><p>{countFeedback.text}</p></div>}
  <div className="ux-bottom"><button type="button" className="ux-secondary" onClick={()=>setCountStep('bags')} disabled={busy}>{t.back}</button><button type="button" className="ux-main-button" disabled={busy||Boolean(countProblem)} onClick={()=>void submitCount()}>{busy?(lang==='es'?'Guardando…':'Saving…'):t.save}</button></div>
 </div>}
 <section className="ux-history">
  <h2>{lang==='es'?'Conteos por fecha':'Daily counts'} <span>{history.length} {lang==='es'?'registros':'records'}</span></h2>
  <div className="pc-period"><label>Desde<input type="date" value={historyFrom} max={today()} onChange={e=>setHistoryFrom(e.target.value)}/></label><label>Hasta<input type="date" value={historyTo} max={today()} onChange={e=>setHistoryTo(e.target.value)}/></label><button className="ux-main-button" type="button" disabled={busy||historyFrom>historyTo||historyTo>today()||Date.parse(historyTo+'T12:00:00Z')-Date.parse(historyFrom+'T12:00:00Z')>90*86400000} onClick={()=>{setAppliedFrom(historyFrom);setAppliedTo(historyTo);}}>Consultar periodo</button></div>
  <div className="pc-table-scroll"><table className="pc-compact-table"><thead><tr><th>Fecha</th><th>Apertura</th><th>Cierre</th></tr></thead><tbody>{groupedCounts.map(g=><tr key={g.day}><th>{g.day}</th>{([g.opening,g.closing] as const).map((c,i)=><td key={i}>{c?<details className="pc-row-detail"><summary><strong>✓ {c.lines.reduce((sum,l)=>sum+l.bagCount,0)} bolsas</strong>{c.isLateEntry&&<small> · Tardío</small>}</summary><div>{c.startedByName} → {c.signedByName}</div><div>Capturado: {stamped(c.capturedAt)}</div><div>{c.lines.map(l=><div key={l.productId}>{l.productName}: {l.bagCount} bolsas ({quantityLabel(l.totalAmount??l.bagCount*(l.bagSizeSnapshot??l.bagWeightKgSnapshot??0)+(l.openKg??0),l.quantityUnit??l.bagUnitSnapshot??'kg')})</div>)}</div><button className="ux-link" onClick={()=>openCorrection('count',c.id)}>{t.correct}</button></details>:<button className="ux-link pc-missing" onClick={()=>{setDate(g.day);setPeriod(i===0?'opening':'closing');startNewCount();}}>— Sin registrar · Añadir</button>}</td>)}</tr>)}</tbody></table></div>
 </section>
 <details className="ux-process ux-movement"><summary>{lang==='es'?'Registrar salida especial (Food Truck, catering o merma)':'Register special usage (Food Truck, catering or waste)'}</summary><p className="ux-muted">{lang==='es'?'Solo cuando exista una salida extraordinaria. Se descuenta del consumo habitual al calcular pronósticos.':'Only for exceptional outgoing inventory. Kept separate from routine demand.'}</p><div className="ux-quick-form">
 <label>{t.product}<select value={moveProduct} onChange={e=>setMoveProduct(e.target.value)}><option value="">—</option>{countableFinished.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>{lang==='es'?'Motivo':'Reason'}<select value={moveKind} onChange={e=>setMoveKind(e.target.value)}><option value="foodtruck">Food Truck</option><option value="windsor">Windsor</option><option value="catering">Catering</option><option value="waste">{lang==='es'?'Merma':'Waste'}</option><option value="adjustment">{lang==='es'?'Ajuste de inventario (salida)':'Inventory adjustment (out)'}</option></select></label>
 <label>{lang==='es'?`Cantidad retirada (${packUnitLabel(presentation(countableFinished.find(p=>p.id===moveProduct)??{bagWeightKg:1}).bagUnit)})`:'Quantity removed'}<input type="number" inputMode="decimal" min="0.001" step="0.1" value={moveQty} onChange={e=>setMoveQty(e.target.value)}/></label>
 <label>{t.worker}<select value={moveEmployee} onChange={e=>setMoveEmployee(e.target.value)}><option value="">—</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>{lang==='es'?'Referencia (opcional)':'Reference (optional)'}<input maxLength={250} value={moveNotes} onChange={e=>setMoveNotes(e.target.value)}/></label>
 <button type="button" className="ux-main-button" disabled={busy||!countableFinished.some(p=>p.id===moveProduct)||!moveEmployee||Number(moveQty)<=0} onClick={()=>void save('movement',{siteId:site,operationalDate:date,productId:moveProduct,movementKind:moveKind,quantity:Number(moveQty),unit:presentation(countableFinished.find(p=>p.id===moveProduct)??{bagWeightKg:1}).bagUnit,employeeId:moveEmployee,notes:moveNotes},()=>{setMoveQty('');setMoveNotes('');})}>{lang==='es'?'Registrar salida':'Save movement'}</button></div></details>
 </section>}

 {tab==='production'&&<section className="ux-production">
  <div className="ux-section-head"><div><p className="ux-eyebrow">HOT TACOS</p><h1>{t.cook}</h1></div><button className="ux-secondary" onClick={()=>void refresh().catch(e=>setMessage(String(e)))}>{t.refresh}</button></div>
  <div className="ux-start-batch"><strong>+ {t.createBatch}</strong><div className="ux-quick-form">
   <label>{t.creator}<select value={creator} onChange={e=>setCreator(e.target.value)}><option value="">—</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>{t.product}<select value={productToCreate} onChange={e=>setProductToCreate(e.target.value)}><option value="">—</option>{finished.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>{lang==='es'?'Fecha de producción':'Production date'}<input type="date" value={productionDate} max={today()} onChange={e=>setProductionDate(e.target.value)}/></label>
   <button className="ux-main-button" disabled={busy||!creator||!productToCreate} onClick={()=>void save('batch',{siteId:site,operationalDate:productionDate,productId:productToCreate,employeeId:creator},()=>setProductToCreate(''))}>{t.create}</button>
  </div></div>
  <div className="pc-period"><strong>Historial por periodo</strong><label>Desde<input type="date" value={historyFrom} max={today()} onChange={e=>setHistoryFrom(e.target.value)}/></label><label>Hasta<input type="date" value={historyTo} max={today()} onChange={e=>setHistoryTo(e.target.value)}/></label><button className="ux-main-button" disabled={busy||historyFrom>historyTo||historyTo>today()||Date.parse(historyTo+'T12:00:00Z')-Date.parse(historyFrom+'T12:00:00Z')>90*86400000} onClick={()=>{setAppliedFrom(historyFrom);setAppliedTo(historyTo);}}>Consultar periodo</button></div>
  <div className="ux-tabs"><button className={view==='product'?'active':''} onClick={()=>{setView('product');setExpanded('');}}>{t.byProduct}</button><button className={view==='person'?'active':''} onClick={()=>{setView('person');setExpanded('');}}>{t.byPerson}</button></div>
  {view==='product'?<>
   {todaysActive.length>0&&<div className="pc-active-list"><h2 className="pc-list-title">{lang==='es'?'Preparaciones en curso · Hoy':'Active preparations · Today'} <span>{todaysActive.length}</span></h2>{todaysActive.map(activeProductCard)}</div>}
   {olderActive.length>0&&<details className="pc-pending-group"><summary><strong>{lang==='es'?'Preparaciones pendientes de fechas anteriores':'Pending preparations from earlier dates'}</strong><span>{olderActive.length}</span></summary><div className="pc-pending-body">{olderActive.map(activeProductCard)}</div></details>}
   {activeBatches.length===0&&<p className="pc-empty-state">{lang==='es'?'No hay preparaciones abiertas.':'No open preparations.'}</p>}
   {completedDays.length>0&&<section className="pc-completed-section"><h2 className="pc-list-title">{lang==='es'?'Producción finalizada':'Completed production'}</h2>{completedDays.map(completedProductDay)}</section>}
  </>:<>
   <div className="pc-person-overview">{staff.map(p=>{
    const assigned=activeBatches.filter(b=>participated(b,p.id)||expanded===`${b.id}:${p.id}`);
    const remaining=activeBatches.filter(b=>!assigned.some(item=>item.id===b.id));
    const ms=data.activities.filter(a=>a.employeeId===p.id&&activeBatches.some(b=>b.id===a.batchId)).reduce((sum,a)=>sum+elapsed(a,now),0);
    return <details className="pc-person-row" key={p.id}><summary><strong>{p.name}</strong><span>{assigned.length?assigned.map(b=>b.productName).join(' · '):(lang==='es'?'Sin preparación activa':'No active preparation')}</span><b>{assigned.length?duration(ms):'—'}</b></summary>
     <div className="pc-person-row-body">{assigned.map(b=><div key={b.id} className="pc-person-work"><small>{b.productName} · {b.operationalDate}{b.operationalDate!==today()?(lang==='es'?' · Pendiente anterior':' · Previous date'):''}</small>{ingredientPanel(b,p)}{expanded===`${b.id}:${p.id}`&&finishPanel(b,p.id)}</div>)}
      {remaining.length>0&&<label className="pc-add-participant">{lang==='es'?'Incorporarse a una preparación':'Join a preparation'}<select value="" onChange={e=>addParticipant(e.target.value,p.id)}><option value="">{lang==='es'?'Seleccionar preparación…':'Choose preparation…'}</option>{remaining.map(b=><option key={b.id} value={b.id}>{b.productName} · {b.operationalDate}</option>)}</select></label>}
      {assigned.length===0&&remaining.length===0&&<p className="pc-empty-state">{lang==='es'?'No hay preparaciones abiertas.':'No open preparations.'}</p>}
     </div>
    </details>;
   })}</div>
   {completedDays.length>0&&<section className="pc-completed-section"><h2 className="pc-list-title">{lang==='es'?'Actividad finalizada por persona':'Completed work by employee'}</h2>{completedDays.map(day=>{
    const daily=completedBatches.filter(b=>b.operationalDate===day);
    const participants=staff.filter(p=>daily.some(b=>participated(b,p.id)));
    return <details key={day} className="pc-day-production pc-completed-day"><summary><strong>{day}</strong><span>{daily.length} {lang==='es'?'preparaciones':'preparations'}</span></summary><div className="pc-completed-day-body">{participants.map(p=><details key={p.id} className="pc-closed-batch"><summary><strong>{p.name}</strong><span>{daily.filter(b=>participated(b,p.id)).length} {lang==='es'?'preparaciones':'preparations'}</span></summary><div className="pc-completed-details">{daily.filter(b=>participated(b,p.id)).map(b=><div className="pc-person-completed" key={b.id}><strong>{b.productName}</strong> · {quantityLabel(b.outputAmount??b.outputKg??0,b.outputUnit??b.bagUnitSnapshot??'kg')}{ingredientPanel(b,p)}</div>)}</div></details>)}</div></details>;
   })}</section>}
  </>}
 </section>}

 {tab==='catalog'&&<section className="ux-catalog"><div className="ux-section-head"><h1>{t.manage}</h1></div><div className="ux-tabs ux-catalog-tabs"><button className={catalogType==='product'?'active':''} onClick={()=>{setCatalogType('product');setEditing(null);}}>{t.products}</button><button className={catalogType==='ingredient'?'active':''} onClick={()=>{setCatalogType('ingredient');setEditing(null);}}>{t.ingredients}</button><button className={catalogType==='staff'?'active':''} onClick={()=>{setCatalogType('staff');setEditing(null);}}>{t.staff}</button></div><div className="ux-catalog-bar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/><button className="ux-main-button" onClick={()=>prepareCatalog(catalogType)}>+ {t.add}</button></div>{editing&&<section className="ux-paper ux-catalog-form"><h2>{editing==='new'?t.add:t.edit}</h2><label>{t.name}<input value={entryName} onChange={e=>setEntryName(e.target.value)} maxLength={120}/></label>{catalogType==='product'&&<><label className="pc-inventory-toggle"><input type="checkbox" checked={entryCountable} onChange={e=>setEntryCountable(e.target.checked)}/><span><strong>{lang==='es'?'Incluir en conteos físicos':'Include in physical counts'}</strong><small>{lang==='es'?'Desactivar para marinados y preparaciones intermedias. Se podrán producir, cronometrar y usar como ingrediente sin exigir conteo de apertura y cierre.':'Turn off for intermediate preparations: still produce, time and reuse as an ingredient without daily counting.'}</small></span></label><div className="pc-pack-form">{entryCountable&&<label>{lang==='es'?'Contenido por bolsa':'Bag contents'}<input type="number" min="0.001" step="any" value={entryWeight} onChange={e=>setEntryWeight(e.target.value)}/></label>}<label>{entryCountable?(lang==='es'?'Unidad de contenido':'Content unit'):(lang==='es'?'Unidad de producción':'Production unit')}<select value={entryPackUnit} onChange={e=>setEntryPackUnit(e.target.value)}>{PACK_UNITS.map(u=><option key={u.id} value={u.id}>{lang==='es'?u.es:u.en}</option>)}</select></label></div><div className="ux-planning-fields"><h3>{entryCountable?(lang==='es'?'Cobertura y planificación':'Coverage and planning'):(lang==='es'?'Procedimiento de producción':'Production procedure')}</h3>{entryCountable&&<><label>{lang==='es'?'Días de cobertura objetivo':'Target coverage days'}<input type="number" min="1" max="180" step="1" value={entryTargetDays} onChange={e=>setEntryTargetDays(e.target.value)}/></label><label>{lang==='es'?'Días de cobertura mínima':'Minimum coverage days'}<input type="number" min="0" step="1" value={entryMinDays} onChange={e=>setEntryMinDays(e.target.value)}/></label></>}<label className="ux-process-label">{lang==='es'?'Proceso de preparación (pasos cronológicos; sin cantidades)':'Preparation procedure (ordered steps; no quantities)'}<textarea rows={8} maxLength={12000} placeholder={lang==='es'?'1. Preparar...\n2. Limpiar...\n3. Cocinar...':'1. Prepare...\n2. Clean...\n3. Cook...'} value={entryProcess} onChange={e=>setEntryProcess(e.target.value)}/></label></div>{!entryCountable&&<p className="ux-muted">{lang==='es'?'Se registra producción por cantidad y tiempo; no genera inventario contable ni pronóstico de existencias.':'Production quantities and labor are recorded without physical stock counts or inventory forecasts.'}</p>}</>}{catalogType==='ingredient'&&<label>{t.unit}<select value={entryUnit} onChange={e=>setEntryUnit(e.target.value)}>{PC_UNITS.map(u=><option key={u.id} value={u.id}>{lang==='es'?u.es:u.en}</option>)}</select></label>}<div className="ux-location-choices"><strong>{lang==='es'?'Sucursal:':'Location:'} {locations.find(l=>l.id===site)?.name}</strong>{editing!=='new'&&entrySites.length>1&&<small>{lang==='es'?'Registro compartido existente: se conservan sus sucursales originales.':'Existing shared record: original locations are preserved.'}</small>}<label><input type="checkbox" checked={entryActive} onChange={e=>setEntryActive(e.target.checked)}/>{t.active}</label></div><div className="ux-bottom"><button className="ux-secondary" onClick={()=>setEditing(null)}>{t.cancel}</button><button className="ux-main-button" disabled={busy||!entryName.trim()||!entrySites.length||(catalogType==='product'&&entryCountable&&!(Number(entryWeight)>0))} onClick={()=>void submitCatalog()}>{t.saveCatalog}</button></div></section>}<div className="ux-catalog-grid">{(catalogType==='staff'?data.staff:data.products.filter(p=>p.kind===(catalogType==='product'?'finished':'ingredient'))).filter(p=>p.siteIds.includes(site)&&p.name.toUpperCase().includes(query.toUpperCase())).map(p=><article className="ux-catalog-card" key={p.id}><div><strong>{p.name}</strong><small>{isProduct(p)?(p.kind==='finished'?(p.countable===false?(lang==='es'?`Producción sin conteo · ${packUnitLabel(presentation(p).bagUnit)}`:`Production only · ${packUnitLabel(presentation(p).bagUnit)}`):`${presentation(p).bagSize} ${packUnitLabel(presentation(p).bagUnit)}/${t.bags}`):PC_UNITS.find(u=>u.id===p.defaultUnit)?.[lang]??p.defaultUnit):p.siteIds.join(' · ')}</small></div><button className="ux-secondary" onClick={()=>prepareCatalog(catalogType,p)}>{t.edit}</button></article>)}</div></section>}
 {tab==='management'&&isSuperAdmin&&(management?<ManagementDashboard data={management} lang={lang} email={adminUser?.email??''} onRefresh={()=>{if(adminUser){setManagement(null);void loadManagement(adminUser).catch(e=>setMessage(String(e)));}}} onLogout={()=>void adminLogout()}/>:<section className="mi-loading">{managementLoading?(lang==='es'?'Calculando KPIs…':'Calculating KPIs…'):(lang==='es'?'Cargando Management Information…':'Loading Management Information…')}</section>)}
 </main>
 {adminLoginOpen&&<div className="ux-overlay" role="presentation"><section className="ux-modal ux-admin-login" role="dialog" aria-modal="true" aria-label="Management"><div className="ux-modal-head"><div><p className="ux-eyebrow">MANAGEMENT INFORMATION</p><h2>{lang==='es'?'Acceso de superadministrador':'Super admin access'}</h2></div><button className="ux-secondary" onClick={()=>setAdminLoginOpen(false)}>×</button></div><p className="ux-muted">{lang==='es'?'Los conteos y producción siguen disponibles para el equipo sin iniciar sesión. Este acceso es únicamente para KPIs y análisis de Management.':'Counts and production remain available to the team without sign-in. This access is only for Management KPIs and analysis.'}</p>{adminError&&<div className="ux-auth-error">{adminError}</div>}<label>{lang==='es'?'Correo':'Email'}<input type="email" autoComplete="username" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)}/></label><label>{lang==='es'?'Contraseña':'Password'}<input type="password" autoComplete="current-password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void adminLogin();}}/></label><div className="ux-bottom"><button className="ux-secondary" onClick={()=>setAdminLoginOpen(false)}>{t.cancel}</button><button className="ux-main-button" disabled={busy||!adminEmail.trim()||!adminPassword} onClick={()=>void adminLogin()}>{lang==='es'?'Entrar':'Sign in'}</button></div></section></div>}
 {timerCorrection&&<div className="ux-overlay" role="presentation"><section className="ux-modal ux-timer-modal" role="dialog" aria-modal="true" aria-label={lang==='es'?'Corregir cronómetro':'Correct timer'}>
  <div className="ux-modal-head"><h2>{lang==='es'?'Corregir cronómetro':'Correct timer'}</h2><button type="button" className="ux-secondary" onClick={()=>setTimerCorrection(null)} aria-label="Cerrar">×</button></div>
  <p className="ux-muted">{lang==='es'?'Si olvidaste iniciar o detener el cronómetro, corrige las horas reales. El historial anterior se conservará.':'Correct the actual start/stop times. Previous values remain in history.'}</p>
  <label>{lang==='es'?'Tiempo de trabajo de':'Time worked by'}<select value={timerCorrection.employeeId} onChange={e=>selectTimerWorker(e.target.value)}>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  {timerCorrection.original.length===0&&<p className="ux-muted">{lang==='es'?'Este empleado no tiene intervalos guardados en este lote. Puedes registrar uno nuevo.':'No recorded time intervals for this employee in this batch. You can add one.'}</p>}
  {timerIntervals.map((line,i)=><div className="ux-timer-interval" key={i}><strong>{lang==='es'?`Intervalo ${i+1}`:`Interval ${i+1}`}</strong><div className="ux-timer-timefields"><label>{lang==='es'?'Inicio':'Start'}<input type="datetime-local" value={line.startedAt} max={datetimeLocal(new Date(now).toISOString())} onChange={e=>setTimerIntervals(v=>v.map((x,j)=>j===i?{...x,startedAt:e.target.value}:x))}/></label><label>{lang==='es'?'Fin (vacío = corriendo)':'End (blank = running)'}<input type="datetime-local" value={line.stoppedAt} max={datetimeLocal(new Date(now).toISOString())} onChange={e=>setTimerIntervals(v=>v.map((x,j)=>j===i?{...x,stoppedAt:e.target.value}:x))}/></label></div><button type="button" className="ux-link" onClick={()=>setTimerIntervals(v=>v.filter((_,j)=>j!==i))}>{lang==='es'?'Eliminar intervalo':'Remove interval'}</button></div>)}
  {timerIntervals.length===0&&timerCorrection.original.length>0&&<p className="ux-warning">{lang==='es'?'Eliminarás todos los intervalos de esta persona en este lote al guardar. El historial original se conservará.':'Saving will remove all recorded intervals for this worker in this batch. The original audit history remains.'}</p>}
  <button type="button" className="ux-secondary" disabled={timerIntervals.some(v=>!v.startedAt||!v.stoppedAt)} onClick={()=>{setTimerCorrectionError('');setTimerIntervals(v=>[...v,{startedAt:'',stoppedAt:''}]);}}>{lang==='es'?'+ Agregar otro intervalo':'+ Add another interval'}</button>
  <label>{lang==='es'?'¿Quién corrige?':'Corrected by'}<select value={timerCorrector} onChange={e=>setTimerCorrector(e.target.value)}><option value="">{t.chooseName}</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>{t.reason}<textarea maxLength={500} value={timerReason} onChange={e=>setTimerReason(e.target.value)} placeholder={lang==='es'?'Ej. Olvidé detenerlo a las 14:20':'E.g., I forgot to stop at 14:20'}/></label>
  {!timerTimesValid&&timerIntervals.some(v=>v.startedAt||v.stoppedAt)&&<p className="ux-muted">{lang==='es'?'Revisa las horas. El fin debe ser posterior al inicio y no pueden superponerse intervalos. Si el lote terminó, indica el fin.':'Check the start/end times; intervals cannot overlap.'}</p>}
  <label>Código de autorización del encargado<input type="password" autoComplete="off" value={correctionCode} onChange={e=>setCorrectionCode(e.target.value)}/></label>
  {timerCorrectionError&&<p role="alert" style={{color:'#a12626',fontSize:13,fontWeight:700}}>{timerCorrectionError}</p>}
  <div className="ux-bottom"><button type="button" className="ux-secondary" onClick={()=>setTimerCorrection(null)}>{t.cancel}</button><button type="button" className="ux-main-button" disabled={busy||!correctionCode} onClick={()=>void submitTimerCorrection()}>{busy?'Guardando…':t.saveChange}</button></div>
 </section></div>}
 {correction&&<div className="ux-overlay ux-correction-overlay" role="presentation">
  <section className="ux-modal ux-correction-modal" role="dialog" aria-modal="true" aria-label={t.correct}>
   <header className="ux-modal-head ux-correction-head">
    <div><p className="ux-eyebrow">{lang==='es'?'CONTROL DE INVENTARIO':'INVENTORY CONTROL'}</p><h2>{correction.type==='count'?(lang==='es'?'Corregir conteo':'Correct count'):t.correct}</h2></div>
    <button type="button" className="ux-secondary ux-correction-close" onClick={()=>setCorrection(null)} aria-label={lang==='es'?'Cerrar corrección':'Close correction'}>×</button>
   </header>
   <div className="ux-correction-body">
    <p className="ux-muted ux-correction-help">{t.reviewCorrection}</p>
    {correction.type==='count'&&data.counts.filter(c=>c.id===correction.id).map(c=><div className="ux-correction-count" key={c.id}>
     <div className="ux-correction-context"><strong>{c.operationalDate}</strong><span>{c.period==='opening'?t.opening:t.closing}</span><span>{locations.find(x=>x.id===c.siteId)?.name??c.siteId}</span></div>
     <div className="ux-correction-list">
      {c.lines.map(l=><div className="ux-correction-item" key={l.productId}>
       <div className="ux-correction-item-heading"><strong>{l.productName}</strong><small>{l.bagSizeSnapshot??l.bagWeightKgSnapshot} {packUnitLabel(l.bagUnitSnapshot??'kg')}/{t.bags}</small></div>
       <div className="ux-correction-inputs">
        <label>{lang==='es'?'Bolsas completas':'Full bags'}<input type="number" min="0" step="1" inputMode="numeric" value={correctionLines[l.productId]??l.bagCount} onChange={e=>setCorrectionLines(v=>({...v,[l.productId]:Math.max(0,Math.floor(Number(e.target.value)||0))}))}/></label>
        <label>{lang==='es'?'Bolsa abierta':'Open bag'} ({packUnitLabel(l.bagUnitSnapshot??'kg')})<input type="number" min="0" step="0.1" inputMode="decimal" value={correctionOpen[l.productId]??String(l.openAmount??l.openKg??0)} onChange={e=>setCorrectionOpen(v=>({...v,[l.productId]:e.target.value}))}/></label>
       </div>
      </div>)}
     </div>
    </div>)}
    {correction.type!=='count'&&<div className="ux-correction-fields">
     <label>{correction.type==='output'&&data.batches.find(b=>b.id===correction.id)?.countableSnapshot===false?(lang==='es'?'Cantidad producida':'Produced quantity'):correction.type==='output'?t.produced:t.amount}<input type="number" min={correction.type==='output'&&data.batches.find(b=>b.id===correction.id)?.countableSnapshot!==false?'0':'0.001'} step={correction.type==='output'&&data.batches.find(b=>b.id===correction.id)?.countableSnapshot!==false?'1':'any'} value={correctQty} onChange={e=>setCorrectQty(e.target.value)}/></label>
     {correction.type==='output'&&data.batches.find(b=>b.id===correction.id)?.countableSnapshot!==false&&<label>{lang==='es'?'Contenido adicional de bolsa':'Additional bag contents'}<input type="number" min="0" step="0.1" value={correctPartial} onChange={e=>setCorrectPartial(e.target.value)}/></label>}
     {correction.type==='input'&&<label>{t.unit}<select value={correctUnit} onChange={e=>setCorrectUnit(e.target.value)}>{PC_UNITS.map(u=><option key={u.id} value={u.id}>{lang==='es'?u.es:u.en}</option>)}</select></label>}
    </div>}
    <div className="ux-correction-meta">
     <h3>{lang==='es'?'Autorización de la corrección':'Correction authorization'}</h3>
     <div className="ux-correction-auth-fields">
      <label>{t.corrector}<select value={correctEmployee} onChange={e=>setCorrectEmployee(e.target.value)}><option value="">{t.chooseName}</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>{lang==='es'?'Código del encargado':'Manager code'}<input type="password" autoComplete="off" value={correctionCode} onChange={e=>setCorrectionCode(e.target.value)}/></label>
     </div>
     <label>{t.reason}<textarea rows={3} value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder={t.reasonHint}/></label>
    </div>
   </div>
   <footer className="ux-bottom ux-correction-footer">
    <button type="button" className="ux-secondary" onClick={()=>setCorrection(null)}>{t.cancel}</button>
    <button type="button" className="ux-main-button" disabled={busy||reason.trim().length<5||!correctEmployee||!correctionCode} onClick={()=>void submitCorrection()}>{busy?(lang==='es'?'Guardando…':'Saving…'):t.saveChange}</button>
   </footer>
  </section>
 </div>}
 </div>;
}
