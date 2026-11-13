import 'server-only';
import {getAuth} from 'firebase-admin/auth';
import {db,requireSameOrigin} from '@/lib/pc-server';
import {isSuperAdminEmail} from '@/lib/super-admin';
import {isOpsSite,type OpsSite} from '@/lib/ops-contract';

export type WorkspaceRole='admin'|'kitchen'|'ops_buyer'|'ops_backoffice';
export type WorkspaceAccess={uid:string;email:string;role:WorkspaceRole;siteId:OpsSite};

export async function requireWorkspaceAccess(request:Request,siteId:unknown,allowed:readonly WorkspaceRole[]):Promise<WorkspaceAccess>{
  requireSameOrigin(request);
  if(!isOpsSite(siteId))throw new Error('INVALID_SITE');
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
  const granted=role==='kitchen'?profile.pcSiteIds:profile.opsSiteIds;
  if(!Array.isArray(granted)||!granted.includes(siteId))throw new Error('WORKSPACE_SITE_FORBIDDEN');
  return {uid:decoded.uid,email,role:role as WorkspaceRole,siteId};
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
