import {NextRequest,NextResponse} from 'next/server';
import {demoReport} from '@/lib/pc-reports-server';
import {getConfig} from '@/lib/pc-report-params';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{const params=new URLSearchParams(req.nextUrl.searchParams);params.set('product','protein-01');return NextResponse.json(demoReport(getConfig(params,true)),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'INVALID_DEMO_FILTER'},{status:400});}}
