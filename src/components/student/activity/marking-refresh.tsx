"use client";
import { useEffect, useRef } from "react";

import { MAX_WAIT_MS, SLOW_REFRESH_MS } from "@/components/marking-progress";
import { createClient } from "@/utils/supabase/client";

/**
 * While sprints are being marked, checks (own rows, RLS) for one that finished or whose
 * Finish run failed and handed its claim back, then calls onDone.
 */
export function MarkingRefresh({
  ids,
  onDone,
}: {
  ids: string[];
  onDone: () => void;
}) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const key = ids.join(",");
  useEffect(() => {
    const db = createClient();
    const start = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - start > MAX_WAIT_MS) return clearInterval(poll);
      const { data } = await db
        .from("sessions")
        .select("id")
        .in("id", key.split(","))
        .or("finished_at.not.is.null,finish_requested_at.is.null");
      if (!data?.length) return;
      clearInterval(poll);
      done.current();
    }, SLOW_REFRESH_MS);
    return () => clearInterval(poll);
  }, [key]);
  return null;
}
