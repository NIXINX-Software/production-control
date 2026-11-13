import 'server-only';
import {getAuth} from 'firebase-admin/auth';
import {db,requireSameOrigin} from '@/lib/pc-server';
import {isSuperAdminEmail} from '@/lib/super-admin';
import {isOpsSite,type OpsSite} from '@/lib/ops-contract';

export type WorkspaceRole='admin'|'kitchen'|'ops_buyer'|'ops_backoffice';
export type WorkspaceIdentity={uid:string;email:string;role:WorkspaceRole;pcSiteIds:OpsSite[];opsSiteIds:OpsSite[]};
export type WorkspaceAccess=WorkspaceIdentity&{siteId:OpsSite};

export async function requireWorkspaceIdentity(request:Request,allowed:readonly WorkspaceRole[]):Promise<WorkspaceIdentity>{
  requireSameOrigin(request);
  const header=request.headers.get('authorization')??'';
  if(!header.startsWith('Bearer ')||!header.slice(7).trim())throw new Error('ADMIN_AUTH_REQUIRED');
  const store=db();
  const decoded=await getAuth().verifyIdToken(header.slice(7).trim(),true);
  const email=typeof decoded.email==='string'?decoded.email.trim().toLowerCase():'';
  const profile=(await store.collection('portal_users').doc(decoded.uid).get()).data();
  if(!profile||profile.active!==true)throw new Error('WORKSPACE_FORBIDDEN');
  const role=profile.role as string;
  if(!['admin','kitchen','ops_buyer','ops_backoffice'].includes(role)||!allowed.includes(role as WorkspaceRole))throw new Error('WORKSPACE_FORBIDDEN');
  if(role==='admin'&&!isSuperAdminEmail(email))throw new Error('SUPERADMIN_REQUIRED');
  const grants=(field:unknown):OpsSite[]=>Array.isArray(field)?field.filter(isOpsSite):[];
  return {uid:decoded.uid,email,role:role as WorkspaceRole,pcSiteIds:grants(profile.pcSiteIds),opsSiteIds:grants(profile.opsSiteIds)};
}
export function ensureWorkspaceSite(identity:WorkspaceIdentity,siteId:unknown,area:'pc'|'ops'):asserts siteId is OpsSite{
  if(!isOpsSite(siteId))throw new Error('INVALID_SITE');
  if(identity.role==='admin')return;
  const granted=area==='pc'?identity.pcSiteIds:identity.opsSiteIds;
  if(!granted.includes(siteId))throw new Error('WORKSPACE_SITE_FORBIDDEN');
}
export async function requireWorkspaceAccess(request:Request,siteId:unknown,allowed:readonly WorkspaceRole[]):Promise<WorkspaceAccess>{
  const identity=await requireWorkspaceIdentity(request,allowed);
  const area=identity.role==='kitchen'?'pc':'ops';
  ensureWorkspaceSite(identity,siteId,area);
  return {...identity,siteId:siteId as OpsSite};
}

export function mayReadOps(role:WorkspaceRole):boolean{
  return role==='admin'||role==='ops_buyer'||role==='ops_backoffice';
}

export function mayUseOpsAction(role:WorkspaceRole,action:string,documentStatus?:unknown):boolean{
  if(role==='admin')return true;
  if(role==='ops_buyer')return ['supplier.add','purchase.add'].includes(action)||
     (action==='document.status'&&documentStatus==='delivered');
  if(role==='ops_backoffice')return ['supplier.add','product.add','presentation.add','receipt.add','goods.verify','payment.add'].includes(action)||
     (action==='document.status'&&['received','rejected'].includes(String(documentStatus)));
  return false;
}
