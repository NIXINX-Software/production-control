import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomUUID} from 'node:crypto';
import {getApps,type App} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {db,requireSameOrigin,text} from '@/lib/pc-server';
import {isOpsSite,type OpsSite} from '@/lib/ops-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const SIZE_LIMIT=8*1024*1024;
function sourceApp():App {
 if(process.env.VERCEL_ENV!=='production')throw new Error('OPS_PREVIEW_DISABLED');
 db();
 const app=getApps().find(a=>a.name==='[DEFAULT]');
 if(!app)throw new Error('FIREBASE_APP_NOT_INITIALIZED');
 return app;
}
async function authorized(_req:NextRequest,site:unknown,_purpose:'read'|'upload'='read'){
 if(!isOpsSite(site))throw new Error('INVALID_SITE');
 const app=sourceApp(),store=getFirestore(app);
 const bucketName=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
 if(!bucketName)throw new Error('OPS_EVIDENCE_BUCKET_NOT_CONFIGURED');
 return {site:site as OpsSite,actor:'operations-station',store,bucket:getStorage(app).bucket(bucketName)};
}
function problem(e:unknown){
 const message=e instanceof Error?e.message:'UPLOAD_ERROR';
 const status=message==='ADMIN_AUTH_REQUIRED'?401:message==='OPS_SITE_FORBIDDEN'||message==='WORKSPACE_SITE_FORBIDDEN'||message==='WORKSPACE_FORBIDDEN'||message==='SUPERADMIN_REQUIRED'||message==='ADMIN_ROLE_REQUIRED'?403:message.endsWith('NOT_CONFIGURED')||message==='OPS_PREVIEW_DISABLED'?503:400;
 return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
function isImage(b:Buffer,mime:string){
 if(mime==='image/jpeg')return b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
 if(mime==='image/png')return b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/webp')return b.length>12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 return false;
}
export async function POST(req:NextRequest){
 try{
  requireSameOrigin(req);
  const form=await req.formData();
  const {site,actor,store,bucket}=await authorized(req,form.get('siteId'),'upload');
  const purchaseId=text(form.get('purchaseId'),130);
  const purchase=(await store.collection('ops_purchases').doc(purchaseId).get()).data();
  if(!purchase||purchase.siteId!==site)throw new Error('INVALID_PURCHASE');
  const upload=form.get('file');
  if(!(upload instanceof File)||upload.size<1||upload.size>SIZE_LIMIT)throw new Error('INVALID_FILE_SIZE');
  const mime=upload.type;
  const buffer=Buffer.from(await upload.arrayBuffer());
  if(!isImage(buffer,mime))throw new Error('INVALID_FILE_TYPE');
  const documentId=site+'_'+randomUUID();
  const ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  // Keep company and ticket type as the only folder levels; use the purchase folio for traceability.
  const purchaseFolio=typeof purchase.folio==='string'&&/^[A-Z0-9-]{1,80}$/.test(purchase.folio)?purchase.folio:purchaseId;
  const storagePath=[site,'tickets-de-compra',purchaseFolio+'_'+documentId+'.'+ext].join('/');
  const object=bucket.file(storagePath);
  await object.save(buffer,{resumable:false,metadata:{contentType:mime,cacheControl:'private,no-store',metadata:{sha256:createHash('sha256').update(buffer).digest('hex')}}});
  try{
   const ts=FieldValue.serverTimestamp();
   await store.runTransaction(async tx=>{
    const ref=store.collection('ops_purchases').doc(purchaseId);
    const latest=(await tx.get(ref)).data();
    if(!latest||latest.siteId!==site)throw new Error('INVALID_PURCHASE');
    tx.create(store.collection('ops_documents').doc(documentId),{siteId:site,purchaseId,storagePath,mime,size:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),createdBy:actor,createdAt:ts});
    tx.update(ref,{documentCount:FieldValue.increment(1),documentStatus:['missing','rejected'].includes(latest.documentStatus)?'captured':latest.documentStatus,updatedAt:ts});
    tx.create(store.collection('ops_audit').doc(site+'_'+randomUUID()),{siteId:site,purchaseId,action:'document.uploaded',documentId,actor,createdAt:ts});
   });
  }catch(e){await object.delete().catch(()=>undefined);throw e;}
  return NextResponse.json({ok:true,id:documentId});
 }catch(e){return problem(e);}
}
export async function GET(req:NextRequest){
 try{
  const q=req.nextUrl.searchParams,{site,store,bucket}=await authorized(req,q.get('siteId'));
  const id=text(q.get('documentId'),130);
  const snap=await store.collection('ops_documents').doc(id).get(),document=snap.data();
  if(!document||document.siteId!==site||typeof document.storagePath!=='string')throw new Error('DOCUMENT_NOT_FOUND');
  const [url]=await bucket.file(document.storagePath).getSignedUrl({version:'v4',action:'read',expires:Date.now()+2*60*1000,responseDisposition:'inline'});
  return NextResponse.json({url,expiresInSeconds:120},{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){return problem(e);}
}
