'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

/** The book's cover mockup when one was uploaded, otherwise a coloured cover with the title. */
export function BookCover({ url, color, title, className, label = true }: { url?: string | null; color?: string | null; title: string; className?: string; label?: boolean }) {
  const c = color || '#6366f1';
  if (url) return <div className={cn('relative overflow-hidden bg-slate-100', className)}><img src={url} alt={`Cover of ${title}`} className="size-full object-cover" loading="lazy" draggable={false} /></div>;
  return (
    <div className={cn('relative flex items-end overflow-hidden p-3 text-white', className)} style={{ background: `linear-gradient(150deg, ${c}, ${c}bb 60%, ${c}88)` }} aria-label={`Cover of ${title}`} role="img">
      <span aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full bg-white/15" /><span aria-hidden className="absolute -bottom-10 left-6 size-20 rounded-full bg-white/10" />
      {label && <span className="relative text-base font-bold leading-tight drop-shadow-sm">{title}</span>}
    </div>
  );
}

/** Publisher: upload or remove the cover mockup of a book package. */
export function CoverUpload({ packageId, url, color, title }: { packageId: string; url?: string | null; color?: string | null; title: string }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const qc = useQueryClient(); const toast = useToast();
  const done = (m: string) => { qc.invalidateQueries(); toast(m); };
  const upload = async (f?: File) => {
    if (!f) return; setBusy(true);
    const fd = new FormData(); fd.append('file', f);
    try { await api.upload(`/publishing/packages/${packageId}/cover`, fd); done('Cover uploaded'); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button type="button" onClick={() => input.current?.click()} className="focus-ring group relative w-24 overflow-hidden rounded-lg shadow-md" title="Upload a cover mockup (PNG, JPG or WebP)">
        <BookCover url={url} color={color} title={title} className="aspect-[3/4] w-24 text-[10px]" label={!url} />
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">{busy ? 'Uploading…' : <><ImagePlus className="mx-auto size-5" />{url ? 'Change' : 'Add cover'}</>}</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {url && <button type="button" className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600" onClick={async () => { await api.del(`/publishing/packages/${packageId}/cover`); done('Cover removed'); }}><Trash2 className="size-3" />Remove</button>}
    </div>
  );
}
