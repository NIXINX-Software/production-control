import 'server-only';
import {parseTenantDomain} from './tenant-domain';
import {validateTenantConnection,type TenantConnection} from './tenant-connection';
/**
 * Mandatory contract for the future NIXINX Control service-to-service resolver.
 * It MUST authenticate the calling product, verify the exact hostname and
 * entitlement, and return a secret reference (never raw credentials).
 * Until that endpoint exists, callers fail closed. No HTL fallback.
 */
export type TenantRegistry={findByHostname(hostname:string):Promise<unknown>};
export async function resolveAuthorizedConnection(host:string,appSlug:string,registry:TenantRegistry):Promise<TenantConnection>{
 const parsed=parseTenantDomain(host,appSlug);
 const record=await registry.findByHostname(parsed.hostname);
 return validateTenantConnection(parsed.hostname,parsed.appSlug,record);
}
export function currentTenantRegistry():TenantRegistry{
 throw new Error('NIXINX_CONTROL_TENANT_REGISTRY_NOT_CONFIGURED');
}
