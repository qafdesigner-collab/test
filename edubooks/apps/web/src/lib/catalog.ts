'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
export interface Grade { id: string; name: string; sort: number; packageCount: number }
export interface Subject extends Grade { color: string }
export const useGrades = () => useQuery<Grade[]>({ queryKey: ['grades'], queryFn: () => api.get('/catalog/grades') });
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
