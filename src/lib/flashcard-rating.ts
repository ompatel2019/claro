import { z } from "zod";

export const flashcardRatingSchema = z.object({
  sessionId: z.uuid(),
  cardId: z.string().min(1).max(200),
  mark: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  answer: z.string().max(1000),
  answerMode: z.enum(["typed", "spoken"]),
});
