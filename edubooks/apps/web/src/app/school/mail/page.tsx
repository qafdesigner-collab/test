'use client';
import { Suspense } from 'react';
import { MailCenter } from '@/components/mail';
import { PageHeader } from '@/components/common';
import { PageLoader } from '@/components/ui';

export default function MailPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Mail" sub="Write to people or whole groups, send meeting invitations and see who has read them. People with an email address also get a copy by email." />
      <Suspense fallback={<PageLoader />}><MailCenter canCompose /></Suspense>
    </div>
  );
}
