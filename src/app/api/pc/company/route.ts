import {NextRequest,NextResponse} from 'next/server';
import {db,requireSuperAdmin,stamp} from '@/lib/pc-server';
import {PC_TENANT} from '@/lib/pc-tenant';
import {readCompanyProfile,readCompanyUpdate} from '@/lib/pc-company';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const profileRef=()=>db().collection('pc_settings').doc('company');
function fail(error:unknown){
 const message=error instanceof Error?error.message:'SERVER_ERROR';
 const forbidden=['SUPERADMIN_REQUIRED','ADMIN_ROLE_REQUIRED','FORBIDDEN'].includes(message);
 const invalid=['INVALID_COMPANY_UPDATE','INVALID_COMPANY_NAME'].includes(message);
 const conflict=message==='COMPANY_SITE_MISMATCH'||message==='INVALID_COMPANY_PROFILE';
 const status=message==='ADMIN_AUTH_REQUIRED'||message.startsWith('Firebase ID token')?401:forbidden?403:invalid?400:conflict?409:503;
 return NextResponse.json({error:status===503?'COMPANY_SETTINGS_UNAVAILABLE':message},{status,headers});
}
/** Only the public display name and fixed site ID are returned; never credentials. */
export async function GET(){
 try{
  if(process.env.VERCEL_ENV==='preview')return NextResponse.json(readCompanyProfile(undefined),{headers});
  const current=await profileRef().get();
  return NextResponse.json(readCompanyProfile(current.data()),{headers});
 }catch(e){return fail(e);}
}
export async function PUT(req:NextRequest){
 try{
  // Explicitly deny writes from preview, development and CI.
  if(process.env.VERCEL_ENV!=='production')throw new Error('FORBIDDEN');
  const admin=await requireSuperAdmin(req);
  const name=readCompanyUpdate(await req.json());
  const ref=profileRef();
  await db().runTransaction(async tx=>{
   const current=await tx.get(ref);
   readCompanyProfile(current.data());
   tx.set(ref,{siteId:PC_TENANT.id,name,updatedAt:stamp(),updatedBy:admin.uid},{merge:true});
  });
  return NextResponse.json({siteId:PC_TENANT.id,name,configured:true},{headers});
 }catch(e){return fail(e);}
}
