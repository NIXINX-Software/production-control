import {INSTANCE_SITE_NAME} from '@/lib/instance-site';
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${INSTANCE_SITE_NAME} Production Control`,
    short_name: 'HT Production',
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
