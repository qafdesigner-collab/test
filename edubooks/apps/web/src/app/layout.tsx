import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = { title: { default: 'Knowledge Gate', template: '%s · Knowledge Gate' }, description: 'Digital book publishing + multi-school LMS',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' }, appleWebApp: { capable: true, title: 'Knowledge Gate', statusBarStyle: 'default' } };
export const viewport: Viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
