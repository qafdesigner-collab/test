'use client';
import { LayoutDashboard, Library, Tags, ScrollText, Package, Building2, KeyRound, Sparkles, Receipt, Gamepad2, RefreshCw, CalendarDays, MessageCircle, Palette, TrendingUp, GraduationCap, LineChart, FlaskConical, Building, Users, Mail, AtSign } from 'lucide-react';
import { Shell } from '@/components/shell';

const A = 'PUBLISHER_ADMIN', E = 'PUBLISHER_EDITOR', S = 'PUBLISHER_SALES';
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, roles: [A, E] },
  { href: '/admin/books', label: 'Book Packages', icon: Library, roles: [A, E] },
  { href: '/admin/products', label: 'Products & Bundles', icon: Package, roles: [A, E, S] },
  { href: '/admin/schools', label: 'Schools', icon: Building2, roles: [A, E, S] },
  { href: '/admin/users', label: 'Users', icon: Users, roles: [A] },
  { href: '/admin/orders', label: 'Orders', icon: Receipt, roles: [A, S] },
  { href: '/admin/sales', label: 'Sales', icon: TrendingUp, roles: [A, S] },
  { href: '/admin/insights', label: 'Usage Insights', icon: LineChart, roles: [A, E, S] },
  { href: '/admin/licences', label: 'Licences', icon: KeyRound, roles: [A, E, S] },
  { href: '/admin/games', label: 'Game Library', icon: Gamepad2, roles: [A, E] },
  { href: '/admin/training', label: 'Teacher Training', icon: GraduationCap, roles: [A, E, S] },
  { href: '/admin/ai', label: 'AI Assistant', icon: Sparkles, roles: [A, E, S] },
  { href: '/admin/catalog', label: 'Curricula & Grades', icon: Tags, roles: [A, E] },
  { href: '/admin/calendar', label: 'Academic Calendar', icon: CalendarDays, roles: [A, E, S] },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, roles: [A, E, S] },
  { href: '/admin/mail', label: 'Mail', icon: Mail, roles: [A, E, S] },
  { href: '/admin/messages', label: 'Messages', icon: MessageCircle, roles: [A] },
  { href: '/admin/email', label: 'Email settings', icon: AtSign, roles: [A] },
  { href: '/admin/company', label: 'Company & Currency', icon: Building, roles: [A] },
  { href: '/admin/branding', label: 'Branding', icon: Palette, roles: [A] },
  { href: '/admin/demo', label: 'Demo data', icon: FlaskConical, roles: [A] },
  { href: '/admin/updates', label: 'Updates', icon: RefreshCw, roles: [A] },
];
const LABEL: Record<string, string> = { PUBLISHER_ADMIN: 'Super admin', PUBLISHER_EDITOR: 'Editor', PUBLISHER_SALES: 'Sales' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell role={[A, E, S]} theme="publisher" nav={NAV} subtitle="Publisher" deny="This area is for publisher staff only."
      roleLabel={(me) => me.roles.map((r) => LABEL[r]).filter(Boolean).join(', ')}>{children}</Shell>
  );
}
