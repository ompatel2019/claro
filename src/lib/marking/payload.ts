import { studentMarking } from "@/lib/feedback";

export function markingPayload<
  T extends { feedback: Record<string, unknown> | null },
>(marked: T, maxMarks: number, checkStatus: string, model: string) {
  return {
    ...studentMarking(marked),
    max_marks: maxMarks,
    check_status: checkStatus,
    marked_by_model: model,
  };
}
