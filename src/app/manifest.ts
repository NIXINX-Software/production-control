import type { MetadataRoute } from 'next';
import {PC_TENANT} from '@/lib/pc-tenant';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PC_TENANT.name} Production Control`,
    short_name: PC_TENANT.id==='htl'?'HT Production':'Production Control',
    description: 'Conteo de inventario y control de producción',
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fb',
    theme_color: '#17365b',
    icons: [
      { src: '/bt-production-icon-192.png?v=bt-20261015', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/bt-production-icon-512.png?v=bt-20261015', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/bt-production-maskable-512.png?v=bt-20261015', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
