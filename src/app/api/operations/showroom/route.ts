import {NextRequest,NextResponse} from 'next/server';
import {requireSuperAdmin} from '@/lib/pc-server';
import {SHOWROOM_ONLY} from '@/lib/ops-showroom-fixture';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/**
 * Showroom for the future standalone application.
 * Not a public Operations resource: superadmin identity, allowlist and active
 * administrative role are revalidated server-side on EVERY request.
 * Synthetic data only, with no reads from operational ops_* collections.
 */
export async function GET(request:NextRequest){
  try{
    await requireSuperAdmin(request);
    return NextResponse.json(
      {data:SHOWROOM_ONLY,synthetic:true,contractVersion:'ops.showroom.v0.1'},
      {headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}
    );
  }catch(error){
    const message=error instanceof Error?error.message:'SHOWROOM_ACCESS_DENIED';
    const status=message==='ADMIN_AUTH_REQUIRED'?401:403;
    return NextResponse.json(
      {error:status===401?'ADMIN_AUTH_REQUIRED':'SHOWROOM_FORBIDDEN'},
      {status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}
    );
  }
}
