'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { BrandingProvider } from '@/lib/branding';
import { LangProvider } from '@/lib/i18n';
import { registerServiceWorker } from '@/lib/offline';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: (n, e: any) => e?.status >= 500 && n < 2, refetchOnWindowFocus: false, staleTime: 15_000 } },
  }));
  useEffect(() => { registerServiceWorker(); }, []);
  return <QueryClientProvider client={client}><BrandingProvider><LangProvider><ToastProvider>{children}</ToastProvider></LangProvider></BrandingProvider></QueryClientProvider>;
}
