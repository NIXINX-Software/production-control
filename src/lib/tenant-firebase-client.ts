import {getApps,initializeApp,type FirebaseApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import type {TenantConnection,FirebaseClientManifest} from './tenant-connection';
/** Browser bootstrap is allowed only AFTER server-verifying exact host and license.
 * This factory is not an authorization mechanism and is not yet wired to UI routes.
 */
export function createTenantFirebaseClient(
 tenant:Pick<TenantConnection,'tenantId'|'appId'|'firebaseProjectId'>,
 config:FirebaseClientManifest,
){
 if(config.projectId!==tenant.firebaseProjectId)throw new Error('TENANT_FIREBASE_CLIENT_MISMATCH');
 const name=`nixinx:${tenant.appId}:${tenant.tenantId}:${tenant.firebaseProjectId}`;
 const existing=getApps().find(app=>app.name===name);
 if(existing&&existing.options.projectId!==config.projectId)throw new Error('TENANT_FIREBASE_CLIENT_MISMATCH');
 const app:FirebaseApp=existing??initializeApp(config,name);
 return {app,auth:getAuth(app)};
}
