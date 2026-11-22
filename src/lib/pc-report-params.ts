import {INSTANCE_SITE_ID} from './instance-site';
import {pcOperationalDate} from './pc-date';
import {addDays,type ScenarioConfig,type DateRange} from './pc-forecast';
import {validDate,safeSite} from './pc-server';
export function getConfig(params:URLSearchParams,synthetic=false):ScenarioConfig{
 const today=pcOperationalDate();
 const historyTo=params.get('to')??today,historyFrom=params.get('from')??addDays(historyTo,-29);
 const baseTo=params.get('baseTo')??historyTo,baseFrom=params.get('baseFrom')??historyFrom;
 const siteId=params.get('site')??(synthetic?'htw':INSTANCE_SITE_ID),productId=params.get('product')??'';
 const forecastDays=Number(params.get('days')??14);
 if(![historyTo,historyFrom,baseTo,baseFrom].every(validDate)||historyTo<historyFrom||baseTo<baseFrom||!(synthetic?siteId==='htw':safeSite(siteId))||!productId||productId.length>100||!Number.isInteger(forecastDays)||forecastDays<1||forecastDays>90)throw new Error('INVALID_REPORT_FILTER');
 const blockedUntil=params.get('blockedUntil')??undefined,blockReason=params.get('blockReason')??undefined;
 if(blockedUntil&&!validDate(blockedUntil)||blockReason&&blockReason.length>120)throw new Error('INVALID_BLOCK');
 const span=(a:string,b:string)=>Math.floor((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
 if(span(historyFrom,historyTo)>366||span(baseFrom,baseTo)>366||span([historyFrom,baseFrom].sort()[0],[historyTo,baseTo].sort().at(-1)!)>1095)throw new Error('DATE_RANGE_TOO_LARGE');
 const excluded:DateRange[]=[];
 const ranges=params.get('excluded')??'';
 for(const fragment of ranges.split(',').filter(Boolean).slice(0,30)){
  const [from,to]=fragment.split(':');if(!validDate(from)||!validDate(to)||from>to)throw new Error('INVALID_EXCLUSIONS');excluded.push({from,to});
 }
 let events:ScenarioConfig['events']=[];
 try{const raw=params.get('events')??'[]';if(raw.length>2500)throw Error('INVALID_EVENTS');const parsed=JSON.parse(raw) as unknown;
  if(!Array.isArray(parsed)||parsed.length>20)throw Error('INVALID_EVENTS');
  events=parsed.map(v=>{if(!v||typeof v!=='object')throw Error('INVALID_EVENTS');const row=v as Record<string,unknown>;
   const from=String(row.from??''),to=String(row.to??''),growthPct=Number(row.growthPct??0),extraKg=Number(row.extraKg??0);
   if(!validDate(from)||!validDate(to)||from>to||!Number.isFinite(growthPct)||growthPct < -100||growthPct>500||!Number.isFinite(extraKg)||extraKg<0||extraKg>100000)throw Error('INVALID_EVENTS');
   return {from,to,growthPct,extraKg,label:typeof row.label==='string'?row.label.slice(0,80):''};
  });
 }catch{throw new Error('INVALID_EVENTS');}
 return {siteId,productId,historyFrom,historyTo,baseFrom,baseTo,forecastDays,excluded,events,blockedUntil,blockReason};
}
