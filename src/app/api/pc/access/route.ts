import {NextRequest,NextResponse} from 'next/server';
import {requireWorkspaceAccess} from '@/lib/workspace-access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try {
  const access=await requireWorkspaceAccess(req,req.nextUrl.searchParams.get('site'),['admin','kitchen']);
  return NextResponse.json({role:access.role,siteId:access.siteId},{headers:{'Cache-Control':'private,no-store'}});
 }catch(e){
  const error=e instanceof Error?e.message:'WORKSPACE_FORBIDDEN';
  return NextResponse.json({error},{status:error==='ADMIN_AUTH_REQUIRED'?401:403,headers:{'Cache-Control':'private,no-store'}});
 }
}
