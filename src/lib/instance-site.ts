/** Deployment identity; never derived from a URL parameter, cookie or user selection. */
export function isSiteIdentifier(value:unknown):value is string {
  return typeof value==='string' && /^[a-z][a-z0-9-]{1,62}$/.test(value);
}
const legacyNames:Record<string,string>={htl:'Hot Tacos Leamington',htw:'Hot Tacos Windsor',htft:'Hot Tacos Food Truck'};
export function resolveInstanceSite(id:string|undefined,name:string|undefined){
  // Existing HTL deployment has no instance variables yet. Preserve its data contract.
  const siteId=id===undefined?'htl':id;
  if(!isSiteIdentifier(siteId))throw new Error('INVALID_INSTANCE_SITE_ID');
  const siteName=name?.trim() || legacyNames[siteId] || '';
  if(!siteName || siteName.length>120)throw new Error('INVALID_INSTANCE_SITE_NAME');
  return {siteId,siteName};
}
const instance=resolveInstanceSite(process.env.NEXT_PUBLIC_PC_SITE_ID,process.env.NEXT_PUBLIC_PC_SITE_NAME);
export const INSTANCE_SITE_ID=instance.siteId;
export const INSTANCE_SITE_NAME=instance.siteName;
export function isInstanceSite(value:unknown):value is string {
  return value===INSTANCE_SITE_ID;
}
