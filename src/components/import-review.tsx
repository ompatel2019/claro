"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { questionUndoCallback } from "./admin-question-undo";
import {
  bulkQuestions,
  type QuestionUndo,
  mergeDraft,
} from "@/app/admin/content/questions/actions";
import { TablePagination } from "./table-pagination";
import type { Pager } from "@/lib/admin";
import { EmptyState } from "./empty-state";
import { QuestionFile } from "./icons";
import { diffWords } from "@/lib/question-bank";
import { Button } from "./ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";

const subscribeToHydration = () => () => {};

export type ReviewPair = {
  draft: { id: string; stem: string; source: string; status: string };
  row: { id: string; stem: string; source: string; status: string };
  score: number;
};

function Diff({ parts }: { parts: { text: string; changed: boolean }[] }) {
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.changed ? (
          <mark
            key={i}
            className="bg-brand-soft text-brand-text rounded px-0.5"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

/** §4.4 Import review: closest match side by side, a threshold slider and the three actions. */
export function ImportReview({
  rows,
  threshold,
  pager,
  filtered,
}: {
  rows: ReviewPair[];
  threshold: number;
  pager: Pager;
  filtered: boolean;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(threshold);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const base = "/admin/content/questions";
  const act = (fn: () => Promise<QuestionUndo[]>, done: string) =>
    start(async () => {
      try {
        const undo = await fn();
        toast.success(done, {
          duration: 4000,
          action: undo.length
            ? {
                label: "Undo",
                onClick: questionUndoCallback(undo, start, () =>
                  router.refresh(),
                ),
              }
            : undefined,
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t apply that. Try again.",
        );
      }
    });
  return (
    <div className="min-w-0 space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Match sensitivity</CardTitle>
          <CardDescription>
            Show imported drafts whose closest bank match meets this threshold.
          </CardDescription>
          <CardAction>
            <Badge variant="brand" className="tabular-nums">
              {Math.round(value * 100)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <label className="grid gap-2 text-sm font-medium">
            <span className="sr-only">Similarity threshold</span>
            <input
              className="accent-brand w-full"
              type="range"
              min={0.6}
              max={0.99}
              step={0.01}
              value={value}
              aria-valuetext={`${Math.round(value * 100)}%`}
              onChange={(e) => {
                const v = Number(e.target.value);
                setValue(v);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                  const next = new URLSearchParams(params.toString());
                  next.set("status", "review");
                  next.set("threshold", String(v));
                  next.delete("page");
                  router.replace(`${path}?${next}`);
                }, 300);
              }}
            />
            <span className="text-muted-foreground flex justify-between text-xs tabular-nums">
              <span>60% broader</span>
              <span>99% exact</span>
            </span>
          </label>
        </CardContent>
      </Card>
      {!rows.length && (
        <EmptyState
          icon={QuestionFile}
          title={filtered ? "No imports match" : "Nothing to review"}
          description={
            filtered
              ? "Try another search or clear the filters."
              : "Drafts with a close match in the bank appear here."
          }
        />
      )}
      {rows.map(({ draft, row, score }) => {
        const d = diffWords(draft.stem, row.stem);
        return (
          <Card key={draft.id} aria-label={`Review ${draft.id}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Link
                  prefetch={false}
                  className="underline-offset-4 hover:underline"
                  href={`${base}/${draft.id}`}
                >
                  {draft.id}
                </Link>
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
                <Link
                  prefetch={false}
                  className="underline-offset-4 hover:underline"
                  href={`${base}/${row.id}`}
                >
                  {row.id}
                </Link>
              </CardTitle>
              <CardDescription>
                {draft.source} compared with {row.source} · {row.status}
              </CardDescription>
              <CardAction>
                <Badge variant={score >= 0.95 ? "brand" : "warning"}>
                  {Math.round(score * 100)}% similar
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  Imported draft
                </p>
                <Diff parts={d.left} />
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-muted-foreground mb-1 text-xs font-medium">
                  Closest match
                </p>
                <Diff parts={d.right} />
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pending || !hydrated}
                onClick={() =>
                  act(async () => {
                    const r = await bulkQuestions([draft.id], {
                      kind: "publish",
                    });
                    if (r.failures.length)
                      throw new Error(r.failures[0].problem);
                    return r.undo;
                  }, "Published; both kept")
                }
              >
                Keep both
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !hydrated}
                onClick={() =>
                  act(
                    () => mergeDraft(draft.id, row.id),
                    `Merged into ${row.id}`,
                  )
                }
              >
                Merge into existing
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !hydrated}
                onClick={() =>
                  act(
                    async () =>
                      (await bulkQuestions([draft.id], { kind: "retire" }))
                        .undo,
                    "Retired",
                  )
                }
              >
                Retire
              </Button>
            </CardFooter>
          </Card>
        );
      })}
      {pager.total > 0 && (
        <TablePagination pager={pager} label="Import review" />
      )}
    </div>
  );
}
