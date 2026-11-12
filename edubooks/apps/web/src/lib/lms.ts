'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const useMyClasses = () => useQuery<any[]>({ queryKey: ['classes', 'mine'], queryFn: () => api.get('/classes?mine=true') });
export const useMyBooks = (enabled = true) => useQuery<any[]>({ queryKey: ['teacherBooks'], queryFn: () => api.get('/teacher/books'), enabled });
export const useBook = (editionId?: string) => useQuery<any>({ queryKey: ['reader', editionId], queryFn: () => api.get(`/reader/editions/${editionId}`), enabled: !!editionId });
export const className = (c: { name: string; section?: string }) => `${c.name}${c.section ? ` ${c.section}` : ''}`;
export const KIND_LABEL: Record<string, string> = { HOMEWORK: 'Homework', QUIZ: 'Quiz', TEST: 'Test' };
export const QTYPE_LABEL: Record<string, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', FILL_BLANK: 'Fill in the blank', SHORT: 'Short answer', READING: 'Read aloud 🎤' };
