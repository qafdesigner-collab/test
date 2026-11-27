'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { MailCenter } from '@/components/mail';
import { PageLoader } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function ParentMail() {
  const { t } = useT();
  return (
    <div className="space-y-4"><Link href="/parent" className="text-sm text-slate-600 hover:text-slate-900">← {t('Home')}</Link>
      <h1 className="text-2xl font-semibold text-slate-900">📬 {t('Mail from school')}</h1>
      <Suspense fallback={<PageLoader />}><MailCenter /></Suspense></div>
  );
}
