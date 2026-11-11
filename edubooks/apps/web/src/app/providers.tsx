'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { BrandingProvider } from '@/lib/branding';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: (n, e: any) => e?.status >= 500 && n < 2, refetchOnWindowFocus: false, staleTime: 15_000 } },
  }));
  return <QueryClientProvider client={client}><BrandingProvider><ToastProvider>{children}</ToastProvider></BrandingProvider></QueryClientProvider>;
}
