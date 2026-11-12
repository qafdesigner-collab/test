'use client';
import { Suspense } from 'react';
import { Inbox } from '@/components/messaging';
import { useT } from '@/lib/i18n';

export default function PupilMessages() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black text-slate-800">💬 {t('Messages')}</h1>
      <p className="font-bold text-slate-600">{t('Write or send a voice message to your teacher. Your school can see these messages.')}</p>
      <div className="rounded-[2rem] bg-white/90 p-3 shadow-sm ring-4 ring-white"><Suspense><Inbox pupil /></Suspense></div>
    </div>
  );
}
