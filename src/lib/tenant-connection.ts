/**
 * Validation only. NIXINX Control will own the registry and secret references.
 * Do NOT store any tenant service account private key in a public manifest.
 */
import {parseTenantDomain} from './tenant-domain';
export type FirebaseClientManifest={
 apiKey:string;authDomain:string;projectId:string;storageBucket?:string;messagingSenderId?:string;appId:string;
};
export type TenantConnection={
 hostname:string;tenantId:string;appId:string;firebaseProjectId:string;
 client:FirebaseClientManifest;serverCredentialSecretRef:string;enabled:boolean;
};
const ID=/^[a-z][a-z0-9-]{0,62}$/;
export function validateTenantConnection(host:unknown,appSlug:string,value:unknown):TenantConnection{
 const parsed=parseTenantDomain(host,appSlug);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('TENANT_NOT_AUTHORIZED');
 const row=value as Partial<TenantConnection>;
 if(row.enabled!==true||row.hostname!==parsed.hostname||row.tenantId!==parsed.tenantSlug||row.appId!==parsed.appSlug)throw new Error('TENANT_NOT_AUTHORIZED');
 if(typeof row.firebaseProjectId!=='string'||!ID.test(row.firebaseProjectId)||!row.client||
 row.client.projectId!==row.firebaseProjectId||typeof row.client.apiKey!=='string'||!row.client.apiKey||
 typeof row.client.authDomain!=='string'||!row.client.authDomain||
 typeof row.client.appId!=='string'||!row.client.appId||
 typeof row.serverCredentialSecretRef!=='string'||!row.serverCredentialSecretRef.trim())throw new Error('TENANT_CONNECTION_INVALID');
 return row as TenantConnection;
}
export function verifyCredentialProject(target:TenantConnection,credential:{project_id?:string;client_email?:string;private_key?:string}){
 if(credential.project_id!==target.firebaseProjectId||!credential.client_email||!credential.private_key)throw new Error('TENANT_CREDENTIAL_MISMATCH');
 return true;
}
