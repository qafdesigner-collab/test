import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

/** Published exam results of one student (report cards, pupil and parent views). */
export async function examResultsFor(db: DbService, studentId: string) {
  return (await db.q.execute(sql`SELECT e.id, e.title, e.term, e.exam_date AS "examDate", s.name AS subject, m.marks::float AS marks, m.absent, m.remarks,
      (SELECT coalesce(sum(marks), 0) FROM exam_items i WHERE i.exam_id = e.id)::float AS total
    FROM exam_marks m JOIN exams e ON e.id = m.exam_id AND e.status = 'PUBLISHED' LEFT JOIN subjects s ON s.id = e.subject_id
    WHERE m.student_id = ${studentId} ORDER BY e.exam_date DESC NULLS LAST, e.title`)).rows as any[];
}

