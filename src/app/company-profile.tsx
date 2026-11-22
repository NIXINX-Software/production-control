'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {PC_TENANT} from '@/lib/pc-tenant';
import type {CompanyProfile} from '@/lib/pc-company';
type ProfileContext={profile:CompanyProfile;updateProfile:(profile:CompanyProfile)=>void;loaded:boolean;error:string};
const initial:CompanyProfile={siteId:PC_TENANT.id,name:PC_TENANT.name,configured:false};
const Context=createContext<ProfileContext>({profile:initial,updateProfile:()=>{},loaded:false,error:''});
export function useCompanyProfile(){return useContext(Context);}
export function CompanyProfileProvider({children}:{children:ReactNode}){
 const [profile,updateProfile]=useState(initial),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  fetch('/api/pc/company',{cache:'no-store'}).then(async r=>{
   if(!r.ok)throw new Error('COMPANY_SETTINGS_UNAVAILABLE');
   const info=await r.json() as CompanyProfile;
   if(info.siteId!==PC_TENANT.id||typeof info.name!=='string')throw new Error('COMPANY_SITE_MISMATCH');
   if(active){updateProfile(info);setLoaded(true);setError('');}
  }).catch(()=>{if(active){setLoaded(true);setError('No se pudo consultar la configuración de empresa.');}});
  return ()=>{active=false;};
 },[]);
 return <Context.Provider value={{profile,updateProfile,loaded,error}}>{children}</Context.Provider>;
}
