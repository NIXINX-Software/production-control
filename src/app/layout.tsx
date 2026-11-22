import {INSTANCE_SITE_NAME} from '@/lib/instance-site';
import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_PC_SITE_URL || 'https://production-control-sable.vercel.app';
const title = `${INSTANCE_SITE_NAME} | Production Control`;
const description = 'Conteo de inventario y control de producción';
const brandVersion = 'bt-20261015';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: `${INSTANCE_SITE_NAME} Production Control`,
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: 'HT Production',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: `/favicon.ico?v=${brandVersion}`, sizes: 'any', type: 'image/x-icon' },
      { url: `/bt-production-icon-192.png?v=${brandVersion}`, sizes: '192x192', type: 'image/png' },
      { url: `/bt-production-icon-512.png?v=${brandVersion}`, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: `/favicon.ico?v=${brandVersion}`,
    apple: [{ url: `/bt-production-apple-icon.png?v=${brandVersion}`, sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    title,
    description,
    siteName: 'Business Transformation',
    locale: 'es_CA',
    images: [{
      url: `/bt-production-preview.png?v=${brandVersion}`,
      width: 1200,
      height: 630,
      alt: 'Business Transformation — Conteo de inventario y control de producción',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`/bt-production-preview.png?v=${brandVersion}`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#17365b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" translate="no">
      <head><meta name="google" content="notranslate" /></head>
      <body>{children}</body>
    </html>
  );
}
