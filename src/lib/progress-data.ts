import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "./flashcards";
import { rangeFrom, type ProgressRange, type ProgressData } from "./progress";

export const loadProgress = cache(
  async (range: ProgressRange, today: string): Promise<ProgressData> => {
    const db = await createClient();
    const { data, error } = await db.rpc("student_progress", {
      p_from: rangeFrom(range, today),
      p_to: today,
    });
    if (error || !data) throw new Error("Could not load progress");
    return data as ProgressData;
  },
);
// Sydney's day is shared by all cards in a request.
export const progressToday = cache(() => sydneyToday());
