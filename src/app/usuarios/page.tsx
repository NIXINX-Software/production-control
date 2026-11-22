'use client';
import {PC_TENANT} from '@/lib/pc-tenant';

import {useCallback,useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut,type User} from 'firebase/auth';
import {auth} from '@/lib/firebase';
import {isSuperAdminEmail} from '@/lib/super-admin';
import '../pc.css';
import './usuarios.css';

type Viewer={id:string;email:string;name:string;active:boolean;role:'viewer'};
type Result={ok?:boolean;error?:string;viewers?:Viewer[];setupLink?:string;existingFirebaseAccount?:boolean;setupLinkError?:boolean};
const errors:Record<string,string>={
  ADMIN_AUTH_REQUIRED:'Debes iniciar sesión como superadministrador.',
  SUPERADMIN_REQUIRED:'Esta cuenta no está autorizada como superadministrador.',
  ADMIN_ROLE_REQUIRED:'Esta cuenta no tiene el rol administrativo activo en portal_users.',
  FORBIDDEN:'No tienes permiso para administrar usuarios.',
  INVALID_EMAIL:'Introduce un correo válido.',
  INVALID_NAME:'El nombre debe contener entre 2 y 160 caracteres.',
  RESERVED_EMAIL:'No se puede asignar el rol viewer a una cuenta maestra.',
  USER_ALREADY_HAS_ROLE:'La cuenta ya tiene un registro en portal_users. No se modificó su rol.',
  AUTH_EMAIL_ALREADY_EXISTS:'La cuenta de Firebase ya existe. Intenta nuevamente.',
  VIEWER_NOT_FOUND:'El usuario no existe o no tiene rol viewer.',
  VIEWER_INACTIVE:'Activa la cuenta para generar un enlace de contraseña.',
  ACCOUNT_EMAIL_MISMATCH:'El correo de Authentication no coincide con portal_users.',
  SERVER_ERROR:'Error del servidor. Revisa el registro de Vercel o Next.js.',
};
const message=(error:unknown)=>{
  const key=error instanceof Error?error.message:String(error);
  return errors[key]??key;
};

export default function Usuarios() {
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [newEmail,setNewEmail]=useState('');
  const [viewers,setViewers]=useState<Viewer[]>([]);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [setupLink,setSetupLink]=useState('');
  const [lastLoaded,setLastLoaded]=useState(false);

  useEffect(()=>{
    if(!auth){const timer=window.setTimeout(()=>setReady(true),0);return()=>window.clearTimeout(timer);}
    return onAuthStateChanged(auth,account=>{
      setUser(account);setReady(true);setLastLoaded(false);setSetupLink('');
      if(!account)setViewers([]);
    });
  },[]);

  const call=useCallback(async(method:'GET'|'POST',payload?:Record<string,unknown>):Promise<Result>=>{
    const token=await user?.getIdToken();
    if(!token)throw new Error('ADMIN_AUTH_REQUIRED');
    const response=await fetch('/api/pc/viewers',{
      method,cache:'no-store',
      headers:{Authorization:`Bearer ${token}`,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),
    });
    const data=await response.json() as Result;
    if(!response.ok)throw new Error(data.error??'SERVER_ERROR');
    return data;
  },[user]);

  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try {const result=await call('GET');setViewers(result.viewers??[]);setLastLoaded(true);}
    catch(err){setError(message(err));setLastLoaded(false);}
    finally {setLoading(false);}
  },[call]);

  useEffect(()=>{
    if(!user||!isSuperAdminEmail(user.email))return;
    // Load once when the authenticated account changes. The refresh button
    // remains available for manual updates.
    const timer=window.setTimeout(()=>{void refresh();},0);
    return()=>window.clearTimeout(timer);
  },[user,refresh]);

  const login=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError('');setWorking(true);
    try {
      if(!auth)throw new Error('Firebase Authentication no está configurado.');
      const result=await signInWithEmailAndPassword(auth,email.trim(),password);
      setPassword('');
      if(!isSuperAdminEmail(result.user.email)) {
        await signOut(auth);
        throw new Error('SUPERADMIN_REQUIRED');
      }
    } catch(err){setError(message(err));}
    finally{setWorking(false);}
  };

  const create=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setWorking(true);setError('');setNotice('');setSetupLink('');
    try {
      const result=await call('POST',{action:'create',name,email:newEmail});
      setNotice(result.existingFirebaseAccount
        ?'Permiso de consulta asignado a la cuenta existente. Utiliza su contraseña habitual o genera un enlace nuevo.'
        :result.setupLinkError?'Usuario creado. No se pudo generar el enlace inicial: utiliza «Enlace de contraseña» en su fila.'
        :'Usuario creado correctamente. Copia y comparte el enlace de activación de manera privada.');
      setSetupLink(result.setupLink??'');setName('');setNewEmail('');
      await refresh();
    }catch(err){setError(message(err));}
    finally{setWorking(false);}
  };

  const setActive=async(target:Viewer)=>{
    const action=target.active?'deshabilitar':'habilitar';
    if(!window.confirm(`¿Deseas ${action} el acceso de ${target.name} a Consulta operativa?`))return;
    setWorking(true);setError('');setNotice('');setSetupLink('');
    try {
      await call('POST',{action:'set-active',uid:target.id,active:!target.active});
      setNotice(`Acceso ${target.active?'deshabilitado':'habilitado'} para ${target.name}.`);
      await refresh();
    }catch(err){setError(message(err));}
    finally{setWorking(false);}
  };

  const resetLink=async(target:Viewer)=>{
    setWorking(true);setError('');setNotice('');setSetupLink('');
    try {
      const result=await call('POST',{action:'reset-link',uid:target.id});
      setSetupLink(result.setupLink??'');
      setNotice(`Enlace de contraseña generado para ${target.name}. Compártelo únicamente con esa persona.`);
    }catch(err){setError(message(err));}
    finally{setWorking(false);}
  };

  return <main className="pc-users-page">
    <header className="pc-users-header">
      <div><p className="ux-eyebrow">{PC_TENANT.name} · PRODUCTION CONTROL</p><h1>Administrar usuarios de consulta</h1><p className="ux-muted">Solo superadministradores. Aquí no se crean administradores ni se modifican permisos del website.</p></div>
      <div className="pc-users-nav"><Link href="/">← Cocina / Management</Link><Link href="/consulta">Ir a Consulta</Link></div>
    </header>
    {!ready&&<p>Comprobando sesión…</p>}
    {ready&&!user&&<section className="pc-users-panel pc-users-login"><h2>Entrar como superadministrador</h2><form onSubmit={login} className="pc-users-form"><label>Correo<input type="email" required value={email} autoComplete="username" onChange={event=>setEmail(event.target.value)}/></label><label>Contraseña<input type="password" required value={password} autoComplete="current-password" onChange={event=>setPassword(event.target.value)}/></label><button className="ux-main-button" disabled={working}>Iniciar sesión</button></form></section>}
    {ready&&user&&!isSuperAdminEmail(user.email)&&<section className="pc-users-panel"><p>Esta cuenta no es superadministradora.</p><button className="ux-secondary" onClick={()=>auth&&void signOut(auth)}>Cerrar sesión</button></section>}
    {ready&&user&&isSuperAdminEmail(user.email)&&<>
      <div className="pc-users-toolbar"><span>Sesión: <strong>{user.email}</strong></span><div><button className="ux-secondary" disabled={working||loading} onClick={()=>void refresh()}>{loading?'Actualizando…':'Actualizar lista'}</button><button className="ux-secondary" onClick={()=>auth&&void signOut(auth)}>Cerrar sesión</button></div></div>
      <section className="pc-users-panel"><h2>Nuevo usuario de consulta</h2><p className="ux-muted">Solo rol viewer. La persona establecerá su contraseña mediante un enlace privado de Firebase.</p><form className="pc-users-create" onSubmit={create}><label>Nombre<input value={name} required minLength={2} maxLength={160} onChange={event=>setName(event.target.value)} placeholder="Nombre del colaborador"/></label><label>Correo electrónico<input value={newEmail} required type="email" maxLength={160} onChange={event=>setNewEmail(event.target.value)} placeholder="empleado@empresa.com"/></label><button className="ux-main-button" disabled={working||!name.trim()||!newEmail.trim()}>{working?'Procesando…':'Crear acceso viewer'}</button></form></section>
      {setupLink&&<section className="pc-users-panel pc-users-link"><h2>Enlace privado de activación o contraseña</h2><p>Este enlace permite establecer una contraseña. No lo compartas en espacios públicos. Se muestra aquí únicamente después de solicitarlo.</p><div className="pc-users-link-row"><input value={setupLink} readOnly aria-label="Enlace de contraseña"/><button className="ux-main-button" onClick={()=>void navigator.clipboard.writeText(setupLink).catch(()=>setError("No fue posible copiar automáticamente. Selecciona el enlace y cópialo manualmente."))}>Copiar enlace</button></div><button className="ux-secondary" onClick={()=>setSetupLink('')}>Ocultar enlace</button></section>}
      <section className="pc-users-panel"><div className="pc-users-section-title"><h2>Usuarios de consulta ({viewers.length})</h2><span className="ux-muted">No incluye administradores ni superadministradores</span></div><div className="pc-users-table-wrap"><table className="pc-users-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{viewers.map(v=><tr key={v.id}><td><strong>{v.name}</strong></td><td>{v.email}</td><td>viewer</td><td><span className={v.active?'pc-users-active':'pc-users-inactive'}>{v.active?'Activo':'Deshabilitado'}</span></td><td><div className="pc-users-row-actions"><button className="ux-secondary" disabled={working||loading} onClick={()=>void setActive(v)}>{v.active?'Deshabilitar':'Habilitar'}</button><button className="ux-secondary" disabled={working||loading||!v.active} onClick={()=>void resetLink(v)}>Enlace de contraseña</button></div></td></tr>)}</tbody></table>{!loading&&lastLoaded&&viewers.length===0&&<p className="ux-muted">Todavía no hay usuarios viewer registrados.</p>}{loading&&<p className="ux-muted">Cargando usuarios…</p>}</div></section>
    </>}
    {notice&&<p className="pc-users-notice" role="status">{notice}</p>}
    {error&&<p className="pc-users-error" role="alert">{error}</p>}
  </main>;
}
