'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Me { id: string; username: string; displayName: string; roles: string[]; mustChangePassword: boolean; impersonatedBy?: { id: string; name: string } | null; school: { id: string; name: string; code: string } | null }
export const useMe = () => useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/auth/me'), retry: false, staleTime: 60_000 });
export const isPublisherStaff = (me?: Me) => !!me?.roles.some((r) => r.startsWith('PUBLISHER_'));
export const hasRole = (me: Me | undefined, ...roles: string[]) => !!me?.roles.some((r) => roles.includes(r));
export const homeFor = (me: Me) =>
  isPublisherStaff(me) ? (hasRole(me, 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') ? '/admin' : '/admin/schools') : hasRole(me, 'SCHOOL_ADMIN') ? '/school' : hasRole(me, 'TEACHER') ? '/teacher' : hasRole(me, 'STUDENT') ? '/learn' : hasRole(me, 'PARENT') ? '/parent' : '/portal';
