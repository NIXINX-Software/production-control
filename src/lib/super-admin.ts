import {PC_TENANT} from './pc-tenant';
const LEGACY_HTL_ADMIN_EMAILS = [
  'hottacosmanagement@hotmail.com',
  'admin@nixinx.com',
  'admin@nixinex.com',
  'admin@hottacosrestaurant.com',
] as const;
export const SUPER_ADMIN_EMAILS:readonly string[] = process.env.NEXT_PUBLIC_PC_SUPER_ADMIN_EMAILS!==undefined
 ? process.env.NEXT_PUBLIC_PC_SUPER_ADMIN_EMAILS.split(',').map(email=>email.trim().toLowerCase()).filter(Boolean)
 : PC_TENANT.id==='htl'?LEGACY_HTL_ADMIN_EMAILS:[];

export function isSuperAdminEmail(value: string | null | undefined): boolean {
  const email = value?.trim().toLowerCase();
  return Boolean(email && SUPER_ADMIN_EMAILS.includes(email));
}
