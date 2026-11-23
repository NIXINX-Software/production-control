import 'server-only';
import {cert,getApps,initializeApp,type App} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import type {TenantConnection} from './tenant-connection';
import {verifyCredentialProject} from './tenant-connection';
export type TenantServiceCredential={project_id:string;client_email:string;private_key:string};
export type TenantSecretProvider={readCredential(secretRef:string):Promise<TenantServiceCredential>};
/**
 * No Firebase Admin default app in multi-tenant mode.
 * Always pass a registry-verified tenant and a secret read from its authorized reference.
 */
export async function getTenantFirebaseAdmin(tenant:TenantConnection,secrets:TenantSecretProvider){
 const credential=await secrets.readCredential(tenant.serverCredentialSecretRef);
 verifyCredentialProject(tenant,credential);
 const name=`nixinx:${tenant.appId}:${tenant.tenantId}:${tenant.firebaseProjectId}`;
 let app:App|undefined=getApps().find(candidate=>candidate.name===name);
 if(!app){
  app=initializeApp({credential:cert({projectId:credential.project_id,clientEmail:credential.client_email,privateKey:credential.private_key})},name);
 }
 return {app,firestore:getFirestore(app),auth:getAuth(app)};
}
