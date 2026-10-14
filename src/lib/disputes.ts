import { z } from "zod";
export const disputeNoteSchema = z.object({
  note: z.string().trim().min(10).max(1000),
});
export type DisputeHistory = {
  user_id: string;
  total: number;
  open: number;
  resolved: number;
  rejected: number;
  latest_rejected_at: string | null;
};
/** Rejections are unchanged or lowered marks; only resolved disputes enter the rate. */
export function rejectionRate(
  history: Pick<DisputeHistory, "resolved" | "rejected">,
) {
  return history.resolved > 0
    ? Math.round((history.rejected / history.resolved) * 100)
    : null;
}
