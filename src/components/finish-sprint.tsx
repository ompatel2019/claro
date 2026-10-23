"use client";
import { useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { MarkingScreen } from "./marking-screen";
import { Button } from "./ui/button";

/** Finishes an abandoned sprint from the setup banner, then opens its results. */
export function FinishSprint({ id }: { id: string }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = `/student/activity/${id}`;
  async function finish() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${id}/finish`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn’t finish. Try again.");
      window.location.assign(results);
    } catch (e) {
      // The server may have finished after the response was lost or timed out.
      try {
        const { data } = await createClient()
          .from("sessions")
          .select("finished_at")
          .eq("id", id)
          .maybeSingle();
        if (data?.finished_at) {
          window.location.assign(results);
          return;
        }
      } catch {}
      setError(e instanceof Error ? e.message : "Couldn’t finish. Try again.");
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {busy && <MarkingScreen />}
      <Button variant="outline" size="sm" disabled={busy} onClick={finish}>
        {busy ? "Finishing…" : "Finish and mark"}
      </Button>
      {error && (
        <div role="alert" className="text-destructive w-full space-y-2 text-xs">
          <p>{error}</p>
          <a href={results} className="underline">
            View results
          </a>
        </div>
      )}
    </>
  );
}
