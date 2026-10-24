"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { MAX_WAIT_MS, SLOW_REFRESH_MS } from "@/components/marking-progress";

/** While a sprint is being marked, re-renders Activity so its row flips to the score. */
export function MarkingRefresh() {
  const router = useRouter();
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), SLOW_REFRESH_MS);
    const stop = setTimeout(() => clearInterval(poll), MAX_WAIT_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [router]);
  return null;
}
