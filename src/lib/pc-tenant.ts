/** One licensed company per deployment. Public identifiers are not credentials.
 * The existing HTL deployment keeps its historical identifier when both variables are absent.
 * Every new deployment must explicitly set both values before its first build.
 */
export function isSiteId(value:unknown):value is string {
 return typeof value==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(value);
}
export function resolveTenant(id:string|undefined,name:string|undefined){
 if(id===undefined&&name===undefined)return {id:'htl',name:'Hot Tacos Leamington'};
 if(!isSiteId(id)||!name?.trim()||name.trim().length>120)throw new Error('PC_TENANT_NOT_CONFIGURED');
 return {id,name:name.trim()};
}
export const PC_TENANT=Object.freeze(resolveTenant(process.env.NEXT_PUBLIC_PC_SITE_ID,process.env.NEXT_PUBLIC_PC_SITE_NAME));
export function isTenantSite(value:unknown):value is string {return value===PC_TENANT.id;}
