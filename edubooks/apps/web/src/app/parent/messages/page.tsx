'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { Inbox } from '@/components/messaging';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return <div className="space-y-4"><Link href="/parent" className="text-sm text-slate-600 hover:text-slate-900">← {t('Home')}</Link><h1 className="text-2xl font-semibold text-slate-900">{t('💬 Messages')}</h1><Suspense><Inbox parent /></Suspense></div>;
}
