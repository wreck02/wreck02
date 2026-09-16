/** Exam window: 12–16 October 2026. */
export const EXAM_DATE_ISO = '2026-10-12';

export function daysUntilExam(now = new Date()): number {
  const exam = new Date(`${EXAM_DATE_ISO}T09:00:00`);
  return Math.ceil((exam.getTime() - now.getTime()) / 86400000);
}
