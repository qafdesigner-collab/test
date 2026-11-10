'use client';
import * as RD from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { forwardRef } from 'react';

export const cn = clsx;

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'md'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading} {...p}
      className={cn('focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        { primary: 'bg-brand-600 text-white hover:bg-brand-700', secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
          ghost: 'text-slate-600 hover:bg-slate-100', danger: 'bg-red-600 text-white hover:bg-red-700', success: 'bg-emerald-600 text-white hover:bg-emerald-700' }[variant],
        className)}>
      {loading && <Loader2 className="size-4 animate-spin" />}{children}
    </button>
  );
});

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...p} />;

const BADGE = {
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-600/20', PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-500/20', info: 'bg-brand-50 text-brand-700 ring-brand-600/20', neutral: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
} as const;
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof BADGE | string; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE[tone as keyof typeof BADGE] ?? BADGE.neutral, className)}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={status}>{status === 'DRAFT' ? 'Draft' : status === 'PUBLISHED' ? 'Published' : 'Archived'}</Badge>;

/** Full width unless the caller sets its own width class. */
const width = (c?: string) => (/(^|\s)(w-|max-w-|min-w-)/.test(c ?? '') ? '' : 'w-full');
const fieldCls = 'focus-ring block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 disabled:bg-slate-50';
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldCls, 'h-10', width(className), className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, width(className), className)} {...p} />;
});
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(fieldCls, 'h-10 pr-8', width(className), className)} {...p} />;
});
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>{children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]" />
        <RD.Content className={cn('fixed left-1/2 top-[8vh] z-50 w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl bg-white shadow-2xl max-h-[84vh] overflow-y-auto focus:outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}>
          <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
            <div><RD.Title className="text-lg font-semibold text-slate-900">{title}</RD.Title>
              {description ? <RD.Description className="mt-1 text-sm text-slate-500">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}</div>
            <RD.Close className="focus-ring rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="size-5" /></RD.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function Confirm({ open, onOpenChange, title, body, confirmLabel = 'Confirm', danger, onConfirm, loading }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-sm text-slate-600 space-y-2">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('size-5 animate-spin text-slate-400', className)} />;
export const PageLoader = () => <div className="flex h-64 items-center justify-center"><Spinner className="size-7" /></div>;

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{(error as Error)?.message || 'Something went wrong'}</div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('focus-ring -mb-px border-b-2 px-4 py-2.5 text-sm font-medium', value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
