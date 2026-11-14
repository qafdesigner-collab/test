'use client';
import { Copy, Download, Printer } from 'lucide-react';
import { downloadCsv } from '@/lib/api';
import { Badge, Button, Card, Dialog, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { printLoginCards } from '@/lib/login-cards';
import { useMe } from '@/lib/session';
import { usePrintBrand } from '@/lib/branding';

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'green' | 'amber' | 'red' | 'slate' | 'brand' }) {
  const color = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', slate: 'text-slate-500', brand: 'text-brand-600' }[tone ?? 'brand'];
  return (
    <Card className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold', color)}>{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</Card>
  );
}

export function SeatBar({ assigned, total, className }: { assigned: number; total: number; className?: string }) {
  const pct = total ? Math.min(100, (assigned / total) * 100) : 0;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${assigned} of ${total} seats used`}>
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums text-slate-600">{assigned}/{total}</span>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'PUBLISHED', FULFILLED: 'PUBLISHED', APPROVED: 'PUBLISHED', CONFIRMED: 'info', DRAFT: 'DRAFT', PENDING: 'DRAFT',
  SUSPENDED: 'danger', EXPIRED: 'ARCHIVED', REVOKED: 'danger', CANCELLED: 'ARCHIVED', REJECTED: 'danger', RETIRED: 'ARCHIVED',
  TRANSFERRED: 'neutral', RELEASED: 'neutral',
};
export const Status = ({ s }: { s: string }) => <Badge tone={STATUS_TONE[s] ?? 'neutral'}>{s.charAt(0) + s.slice(1).toLowerCase()}</Badge>;

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-slate-500">Nothing here yet.</p>}
    </Card>
  );
}
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;

export interface Credential { role?: string; displayName: string; username: string; password: string; className?: string | null }
/** Shows freshly generated logins ONCE, with print / CSV / copy. */
export function CredentialsDialog({ title, schoolCode, schoolName, creds, onClose, note }: { title: string; schoolCode?: string; schoolName?: string; creds: Credential[]; onClose: () => void; note?: string }) {
  const toast = useToast();
  const { data: me } = useMe();
  const brand = usePrintBrand();
  const print = () => printLoginCards(creds, { code: schoolCode, name: schoolName ?? me?.school?.name }, brand).catch((e) => toast(e.message, 'err'));
  const text = creds.map((c) => `${c.displayName}${c.role ? ` (${c.role})` : ''} — school code ${schoolCode ?? ''}, username ${c.username}, password ${c.password}`).join('\n');
  return (
    <Dialog open onOpenChange={onClose} title={title} description={note ?? 'Passwords are shown only now. Print or download them before closing.'} wide>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Username</th><th className="px-3 py-2">Password</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{creds.map((c) => <tr key={c.username}><td className="px-3 py-2">{c.displayName}{c.role && <span className="text-slate-500"> · {c.role}</span>}</td>
            <td className="px-3 py-2 font-mono">{c.username}</td><td className="px-3 py-2 font-mono">{c.password}</td></tr>)}</tbody></table>
      </div>
      {schoolCode && <p className="mt-3 text-sm text-slate-600">School code: <b className="font-mono">{schoolCode}</b></p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied'))}><Copy className="size-4" />Copy</Button>
        <Button variant="secondary" onClick={() => downloadCsv('logins.csv', creds.map((c) => ({ name: c.displayName, role: c.role ?? '', class: c.className ?? '', schoolCode: schoolCode ?? '', username: c.username, password: c.password })))}><Download className="size-4" />CSV</Button>
        <Button onClick={print}><Printer className="size-4" />Print login cards</Button>
      </div>
    </Dialog>
  );
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
