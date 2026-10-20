import type { TransitionStartFunction } from "react";
import { toast } from "sonner";
import {
  undoQuestionChanges,
  type QuestionUndo,
} from "@/app/admin/content/questions/actions";

export function questionUndoCallback(
  undo: QuestionUndo[],
  start: TransitionStartFunction,
  refresh: () => void,
) {
  return () =>
    start(async () => {
      try {
        await undoQuestionChanges(undo);
        refresh();
      } catch {
        toast.error("Couldn't undo. Reload and try again.");
      }
    });
}
