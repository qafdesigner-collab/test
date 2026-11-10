'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Me { id: string; username: string; displayName: string; roles: string[]; mustChangePassword: boolean; school: { id: string; name: string; code: string } | null }
export const useMe = () => useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/auth/me'), retry: false, staleTime: 60_000 });
export const isPublisherStaff = (me?: Me) => !!me?.roles.some((r) => r === 'PUBLISHER_ADMIN' || r === 'PUBLISHER_EDITOR');
export const homeFor = (me: Me) => (isPublisherStaff(me) ? '/admin' : '/portal');
