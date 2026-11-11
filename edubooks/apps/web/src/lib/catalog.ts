'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export interface Curriculum { id: string; code: string; name: string; description: string; color: string; sort: number; gradeCount: number; schoolCount: number; packageCount: number }
export interface Grade { id: string; name: string; sort: number; packageCount: number; stage: string; curriculumId: string; curriculumCode: string; curriculumName: string }
export interface Subject { id: string; name: string; sort: number; packageCount: number; color: string }
export const useCurricula = () => useQuery<Curriculum[]>({ queryKey: ['curricula'], queryFn: () => api.get('/catalog/curricula') });
/** All grades of the publisher, ordered by curriculum then grade. */
export const useGrades = () => useQuery<Grade[]>({ queryKey: ['grades'], queryFn: () => api.get('/catalog/grades') });
/** Groups grades by stage (keeps order). */
export function byStage<T extends { stage: string }>(list: T[]) {
  const out: { stage: string; items: T[] }[] = [];
  for (const g of list) { const last = out[out.length - 1]; if (last && last.stage === g.stage) last.items.push(g); else out.push({ stage: g.stage, items: [g] }); }
  return out;
}
export const useSubjects = () => useQuery<Subject[]>({ queryKey: ['subjects'], queryFn: () => api.get('/catalog/subjects') });
export const COMPONENT_TYPES: Record<string, string> = {
  STUDENT_BOOK: 'Student Book', HOMEWORK_BOOK: 'Homework Book', WORKBOOK: 'Workbook', TEACHER_GUIDE: 'Teacher Guide',
  FLASHCARDS: 'Flashcards', TEACHER_CARDS: 'Teacher Cards', DANGLERS: 'Danglers', POSTERS: 'Posters & Charts', OTHER: 'Other',
};
export const RESOURCE_TYPES: Record<string, string> = {
  PDF: 'PDF', PRESENTATION: 'PowerPoint', DOCUMENT: 'Word document', SPREADSHEET: 'Spreadsheet', HTML5: 'HTML5 activity', IMAGE: 'Image',
  AUDIO: 'Audio', VIDEO: 'Video', FLASHCARD: 'Flashcard', TEACHER_CARD: 'Teacher card', DANGLER: 'Dangler', POSTER: 'Poster / chart',
  WORKSHEET: 'Worksheet', GAME: 'Game', OTHER: 'Other',
};
export const AUDIENCES: Record<string, string> = { TEACHER: 'Teachers only', STUDENT: 'Students only', ALL: 'Teachers & students' };
export const COVER_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'];
