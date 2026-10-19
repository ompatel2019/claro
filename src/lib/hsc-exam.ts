// 2026 HSC Economics written exam (NESA timetable: Tue 27 Oct 2026, reading time
// from 1:55pm). Source: https://www.nsw.gov.au/education-and-training/nesa/key-dates/hsc-written-exam-timetable
export const HSC_EXAM = {
  name: "HSC Economics exam",
  startsAt: "2026-10-27T13:55:00+11:00",
  when: "Tue 27 Oct, 1:55pm",
} as const;

/** Whole Sydney calendar days from `today` (YYYY-MM-DD) to the exam day; 0 on the day, null after. */
export function examDaysLeft(today: string) {
  const days = Math.round(
    (Date.parse(HSC_EXAM.startsAt.slice(0, 10)) - Date.parse(today)) / 864e5,
  );
  return days >= 0 ? days : null;
}
