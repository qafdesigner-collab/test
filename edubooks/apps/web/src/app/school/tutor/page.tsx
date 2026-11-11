'use client';
import { PageHeader } from '@/components/common';
import { TutorLog, TutorSettings } from '@/components/tutor';

export default function Page() { return <div className="space-y-6"><PageHeader title="Ask Owl (AI tutor)" sub="A safe reading helper for pupils, based only on your books." /><TutorSettings /><TutorLog /></div>; }
