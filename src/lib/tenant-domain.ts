/**
 * Product-neutral, pure tenant hostname parser.
 * Host is a routing hint only; entitlement and Firebase authorization MUST be
 * checked against an authoritative registry on the server.
 */
export type TenantDomain={hostname:string;tenantSlug:string;appSlug:string};
const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED=new Set(['www','admin','api','app','control','localhost','preview']);
export function parseTenantDomain(host:unknown,appSlug:unknown,apex='nixinx.app'):TenantDomain{
 if(typeof host!=='string'||typeof appSlug!=='string'||typeof apex!=='string')throw new Error('TENANT_DOMAIN_INVALID');
 const raw=host.trim();
 // Avoid host ambiguity, wildcards, forwarded authority, and unapproved origins.
 if(!raw||raw!==raw.toLowerCase()||/[:/\\\s,@#?]/.test(raw)||raw.length>253)throw new Error('TENANT_DOMAIN_INVALID');
 const hostLabels=raw.split('.');
 const apexLabels=apex.split('.');
 if(apexLabels.length!==2||!apexLabels.every(x=>LABEL.test(x))||!LABEL.test(appSlug)||RESERVED.has(appSlug))throw new Error('TENANT_CONFIG_INVALID');
 if(hostLabels.length!==apexLabels.length+2)throw new Error('TENANT_DOMAIN_INVALID');
 const [tenant,product,...root]=hostLabels;
 if(!LABEL.test(tenant)||RESERVED.has(tenant)||tenant.length>63||product!==appSlug||root.join('.')!==apex)throw new Error('TENANT_DOMAIN_INVALID');
 return {hostname:raw,tenantSlug:tenant,appSlug};
}
export function selectTenantByHost(host:unknown,appSlug:string,lookup:(hostname:string)=>{hostname:string;companySlug:string;tenantId:string;appId:string;enabled:boolean}|null){
 const parsed=parseTenantDomain(host,appSlug);
 const registered=lookup(parsed.hostname);
 if(!registered||registered.enabled!==true||registered.hostname!==parsed.hostname||registered.companySlug!==parsed.tenantSlug||typeof registered.tenantId!=='string'||!/^[A-Za-z0-9_-]{2,80}$/.test(registered.tenantId)||registered.appId!==parsed.appSlug)throw new Error('TENANT_NOT_AUTHORIZED');
 return {hostname:parsed.hostname,tenantId:registered.tenantId,appId:registered.appId};
}
