import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = { title: { default: 'Knowledge Gate', template: '%s · Knowledge Gate' }, description: 'Digital book publishing + multi-school LMS',
  manifest: '/api/branding/manifest', icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/api/branding/app-icon/180' }, appleWebApp: { capable: true, title: 'Knowledge Gate', statusBarStyle: 'default' } };
export const viewport: Viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
