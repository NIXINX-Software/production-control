import {INSTANCE_SITE_ID,isInstanceSite,isSiteIdentifier} from '@/lib/instance-site';
import {pcOperationalDate} from './pc-date';
import 'server-only';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore, type Firestore} from 'firebase-admin/firestore';
import {isSuperAdminEmail} from '@/lib/super-admin';

export type Site = string;
export const SITES: Site[] = [INSTANCE_SITE_ID];
export const safeSite = isInstanceSite;
// Preserve existing shared catalog metadata; this is NOT an authorization check.
export const validSites = (value: unknown): value is Site[] => Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every(isSiteIdentifier) && new Set(value).size === value.length;
export const text = (value: unknown, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const operationalToday = () => pcOperationalDate();
export const stamp = () => FieldValue.serverTimestamp();
export const newId = () => randomUUID();

function required(name:string):string {
  const value=process.env[name];
  if(!value)throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export function db():Firestore {
  if (!getApps().length) {
    const config=JSON.parse(required('FIREBASE_SERVICE_ACCOUNT_KEY')) as {project_id:string;client_email:string;private_key:string};
    if(config.project_id !== required('NEXT_PUBLIC_FIREBASE_PROJECT_ID'))throw new Error('Firebase project mismatch');
    initializeApp({credential:cert({projectId:config.project_id, clientEmail:config.client_email, privateKey:config.private_key.replace(/\\n/g,'\n')})});
  }
  return getFirestore();
}

export function requireSameOrigin(request: Request): void {
  const origin=request.headers.get('origin');
  if(origin && new URL(origin).origin !== new URL(request.url).origin)throw new Error('FORBIDDEN');
}

export async function requireSuperAdmin(request:Request):Promise<{uid:string;email:string}> {
  requireSameOrigin(request);
  const header=request.headers.get('authorization')??'';
  if(!header.startsWith('Bearer '))throw new Error('ADMIN_AUTH_REQUIRED');
  const token=header.slice(7).trim();
  if(!token)throw new Error('ADMIN_AUTH_REQUIRED');
  db();
  const decoded=await getAuth().verifyIdToken(token,true);
  const email=typeof decoded.email==='string'?decoded.email.trim().toLowerCase():'';
  if(!isSuperAdminEmail(email))throw new Error('SUPERADMIN_REQUIRED');

  // Role authorization is intentionally checked server-side. Authentication alone
  // is not enough to access Management Information. The role document is shared
  // with the administrative portal and never trusted from client-supplied data.
  const accessSnap=await db().collection('portal_users').doc(decoded.uid).get();
  const access=accessSnap.data();
  if(!accessSnap.exists||access?.active!==true||access?.role!=='admin')throw new Error('ADMIN_ROLE_REQUIRED');

  return {uid:decoded.uid,email};
}

export async function findEmployee(id:unknown,site:Site){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error('INVALID_EMPLOYEE');
  const snap=await db().collection('pc_staff').doc(id).get();
  const value=snap.data();
  if(!value||value.active!==true||!validSites(value.siteIds)||!value.siteIds.includes(site))throw new Error('INVALID_EMPLOYEE');
  return {id:snap.id,name:text(value.name),siteIds:value.siteIds};
}

export async function audit(action:string,siteId:Site,operator:{id:string;name:string},details:Record<string,unknown>){
  await db().collection('pc_audit').add({action,siteId,actorId:operator.id,actorName:operator.name,details,createdAt:stamp()});
}

/** No code is required for regular kitchen operations. Corrections only. */
export function requireCorrectionCode(value:unknown):void {
 const configured=process.env.PC_CORRECTION_CODE;
 if(!configured||configured.length<4)throw new Error('CORRECTION_CODE_NOT_CONFIGURED');
 if(typeof value!=='string'||!value||value.length>128)throw new Error('CORRECTION_AUTH_REQUIRED');
 const provided=Buffer.from(value,'utf8'), expected=Buffer.from(configured,'utf8');
 if(provided.length!==expected.length||!timingSafeEqual(provided,expected))throw new Error('CORRECTION_AUTH_REQUIRED');
}
/** A viewer can access operational consultation but never KPI endpoints. */
export async function requireOperationalViewer(request:Request):Promise<{uid:string;email:string}> {
 requireSameOrigin(request);
 const header=request.headers.get('authorization')??'';
 if(!header.startsWith('Bearer '))throw new Error('ADMIN_AUTH_REQUIRED');
 db();const decoded=await getAuth().verifyIdToken(header.slice(7).trim(),true);
 const access=(await db().collection('portal_users').doc(decoded.uid).get()).data();
 if(!access||access.active!==true||!['viewer','admin'].includes(access.role))throw new Error('FORBIDDEN');
 return {uid:decoded.uid,email:typeof decoded.email==='string'?decoded.email:''};
}
