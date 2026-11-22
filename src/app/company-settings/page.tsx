'use client';
import Link from 'next/link';
import {useEffect,useState,type FormEvent} from 'react';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {auth} from '@/lib/firebase';
import {isSuperAdminEmail} from '@/lib/super-admin';
import {useCompanyProfile} from '../company-profile';
import type {CompanyProfile} from '@/lib/pc-company';
import '../pc.css';

export default function CompanySettings(){
 const {profile,updateProfile,loaded,error:loadError}=useCompanyProfile();
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(!auth);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const name=draft??profile.name;
 useEffect(()=>{if(!auth)return;return onAuthStateChanged(auth,account=>{setUser(account);setAuthReady(true);setDraft(null);});},[]);
 async function login(e:FormEvent){e.preventDefault();if(!auth)return;setBusy(true);setMessage('');try{await signInWithEmailAndPassword(auth,email.trim(),password);setPassword('');}catch{setMessage('No se pudo iniciar sesión.');}finally{setBusy(false);}}
 async function save(e:FormEvent){
  e.preventDefault();if(!user||!loaded||loadError)return;setBusy(true);setMessage('');
  try{
   const token=await user.getIdToken();
   const r=await fetch('/api/pc/company',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name})});
   const result=await r.json() as CompanyProfile&{error?:string};
   if(!r.ok||result.siteId!==profile.siteId)throw new Error(result.error??'COMPANY_SETTINGS_UNAVAILABLE');
   updateProfile(result);setDraft(null);setMessage('Nombre de empresa guardado.');
  }catch{setMessage('No se pudo guardar. Comprueba tus permisos y que estés en producción.');}finally{setBusy(false);}
 }
 return <main className="ux-app" style={{maxWidth:620,margin:'24px auto',padding:16}}>
  <header className="ux-section-head"><div><p className="ux-eyebrow">PRODUCTION CONTROL</p><h1>Configuración de empresa</h1></div><Link className="ux-secondary" href="/">Volver</Link></header>
  <section className="ux-paper ux-catalog-form">
   {!authReady?<p>Verificando sesión…</p>:!auth?<p>Firebase Auth no está configurado.</p>:!user?<form onSubmit={login}><p>Inicia sesión con una cuenta administrativa autorizada.</p><label>Correo<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="ux-main-button" disabled={busy}>Iniciar sesión</button></form>:!isSuperAdminEmail(user.email)?<><p>Esta cuenta no tiene permisos de administración.</p><button className="ux-secondary" onClick={()=>void signOut(auth!)}>Cambiar de cuenta</button></>:<form onSubmit={save}>
    <p className="ux-muted">El nombre se muestra en la aplicación. No cambia el restaurante, la conexión a Firebase ni los datos históricos.</p>
    <label>Identificador de empresa<input value={profile.siteId.toUpperCase()} readOnly/></label>
    <label>Nombre comercial<input required minLength={2} maxLength={120} value={name} onChange={e=>setDraft(e.target.value)} disabled={!loaded||Boolean(loadError)||busy}/></label>
    {!loaded?<p>Consultando Firestore…</p>:loadError?<p role="alert">{loadError}</p>:!profile.configured?<p className="ux-muted">Nombre de la instalación actual. Guarda para registrarlo en Firestore.</p>:null}
    <button className="ux-main-button" disabled={busy||!loaded||Boolean(loadError)||name.trim().length<2||(profile.configured&&name.trim()===profile.name)}>Guardar nombre</button>
    <button type="button" className="ux-secondary" onClick={()=>void signOut(auth!)}>Cerrar sesión</button>
   </form>}
   {message&&<p role="status">{message}</p>}
  </section>
 </main>;
}
