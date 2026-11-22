import {PC_TENANT} from './pc-tenant';
export type CompanyProfile={siteId:string;name:string;configured:boolean};
export function validateCompanyName(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<2||value.trim().length>120||/[\u0000-\u001f\u007f]/.test(value))throw new Error('INVALID_COMPANY_NAME');
 return value.trim();
}
export function readCompanyProfile(value:unknown):CompanyProfile{
 if(value===undefined)return {siteId:PC_TENANT.id,name:PC_TENANT.name,configured:false};
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_COMPANY_PROFILE');
 const row=value as Record<string,unknown>;
 if(row.siteId!==PC_TENANT.id)throw new Error('COMPANY_SITE_MISMATCH');
 return {siteId:PC_TENANT.id,name:validateCompanyName(row.name),configured:true};
}
export function readCompanyUpdate(value:unknown):string{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Object.prototype.hasOwnProperty.call(value,'name'))throw new Error('INVALID_COMPANY_UPDATE');
 return validateCompanyName((value as Record<string,unknown>).name);
}
