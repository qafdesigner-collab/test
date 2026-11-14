'use client';
import { Suspense } from 'react';
import { MailCenter } from '@/components/mail';
import { PageLoader } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function PupilMail() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black text-slate-800">📬 {t('Mail from school')}</h1>
      <Suspense fallback={<PageLoader />}><MailCenter playful /></Suspense>
    </div>
  );
}
