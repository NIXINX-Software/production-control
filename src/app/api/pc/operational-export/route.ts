import {NextRequest,NextResponse} from 'next/server';
import {db,requireOperationalViewer,safeSite,validDate} from '@/lib/pc-server';
import {buildOperationalReport,type DocumentRow} from '@/lib/pc-operational-report';
import {operationalWorkbook,csvExport,zipExport} from '@/lib/pc-operational-files';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const filename=(value:string)=>value.replace(/[^a-z0-9_-]/gi,'_');
const asRows=(snapshot:FirebaseFirestore.QuerySnapshot):DocumentRow[]=>snapshot.docs.map(d=>({...(d.data() as Record<string,unknown>),id:d.id}));
const fail=(error:unknown)=>{
 const message=error instanceof Error?error.message:'EXPORT_FAILED';
 const status=message==='ADMIN_AUTH_REQUIRED'?401:message==='FORBIDDEN'||message==='ADMIN_ROLE_REQUIRED'||message==='SUPERADMIN_REQUIRED'?403:message==='INVALID_EXPORT_FILTER'?400:500;
 console.error('Operational export:',message);
 return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
};
/** Viewers and admins can extract operational records only, never Management KPIs. */
export async function GET(req:NextRequest){
 try{
  await requireOperationalViewer(req);
  const q=req.nextUrl.searchParams;
  const site=q.get('site'),from=q.get('from'),to=q.get('to');
  const kind=q.get('format');
  const productId=q.get('productId')??'';
  if(!safeSite(site)||!validDate(from)||!validDate(to)||from>to||
     Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>90*86400000||
     !['xlsx','datamart'].includes(kind??'')||productId.length>100||productId&&!/^[a-z0-9_-]+$/i.test(productId))throw new Error('INVALID_EXPORT_FILTER');
  const store=db();
  // Firestore limits dates before fetching; no multi-year collection downloads.
  const between=(collection:string)=>store.collection(collection).where('operationalDate','>=',from).where('operationalDate','<=',to).get();
  const [p,s,c,b,i,a,m]=await Promise.all([store.collection('pc_products').get(),store.collection('pc_staff').get(),between('pc_counts'),between('pc_batches'),between('pc_inputs'),between('pc_activities'),between('pc_movements')]);
  const products:DocumentRow[]=asRows(p).filter(row=>Array.isArray(row.siteIds)&&row.siteIds.includes(site)).map(row=>({...row,siteIds:[site]})),staff:DocumentRow[]=asRows(s).filter(row=>Array.isArray(row.siteIds)&&row.siteIds.includes(site)).map(row=>({...row,siteIds:[site]}));
  if(productId&&!products.some(row=>row.id===productId&&Array.isArray(row.siteIds)&&row.siteIds.includes(site)&&row.kind==='finished'))throw new Error('INVALID_EXPORT_FILTER');
  const {sheets,tables}=buildOperationalReport({products,staff,counts:asRows(c),batches:asRows(b),inputs:asRows(i),activities:asRows(a),movements:asRows(m)}, {site,from,to,productId:productId||undefined,generatedAt:new Date().toISOString()});
  const base=`Production_Control_${filename(site)}_${from}_${to}${productId?'_producto':''}`;
  const headers:{[key:string]:string}={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
  if(kind==='xlsx'){
   const bytes=operationalWorkbook(sheets);
   return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${base}.xlsx"`}});
  }
  const manifest={schema_version:1,generated_at_utc:new Date().toISOString(),site_id:site,from,to,product_id:productId||null,encoding:'UTF-8 BOM',delimiter:',',grain:'Count: one per date/period; count lines: one per count/product; lot: one per production batch; labor: one per employee interval; employee daily: one per employee/date.',notes:['Full extract for selected period. For repeat ingestion, replace the site/date partition rather than merely appending.','Counts and labor reflect latest records, not historical revision snapshots; corrected intervals can disappear and must be reconciled on re-import.','An open interval has empty stopped_at_utc and 0 closed hours.','Units are not converted across mass, volume or portions.','For reproducible ingestion, record manifest and export timestamp.']};
  const files=[{name:'manifest.json',content:JSON.stringify(manifest,null,2)},...tables.map(t=>({name:t.file,content:csvExport(t.headers,t.rows)}))];
  const bytes=zipExport(files);
  return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${base}_DataMart.zip"`}});
 }catch(error){return fail(error);}
}
