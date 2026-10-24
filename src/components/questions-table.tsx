"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { questionUndoCallback } from "./admin-question-undo";
import {
  bulkQuestions,
  type BulkAction,
} from "@/app/admin/content/questions/actions";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import type { QuestionListRow } from "@/lib/admin-questions";
import { dateLabel, type Topic } from "@/lib/practice";
import { ORIGIN_LABELS, TYPE_LABELS, VERBS } from "@/lib/question-bank";
import { StatusPill, STATUS_PILL } from "./status-pill";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { TopicSelect } from "./topic-select";
import { FormSelect } from "./ui/form-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FormField } from "./form-field";

const BASE = "/admin/content/questions";
type Failure = { id: string; problem: string };

function columns(name: (id: string) => string): Column<QuestionListRow>[] {
  const result: Column<QuestionListRow>[] = [
    {
      id: "source",
      header: "Source",
      sort: true,
      cell: (q) => (
        <Link
          prefetch={false}
          className="font-medium underline-offset-4 hover:underline"
          href={`${BASE}/${q.id}`}
        >
          {q.source}
        </Link>
      ),
    },
    { id: "year", header: "Year", sort: true, cell: (q) => q.year },
    {
      id: "type",
      header: "Type",
      sort: true,
      cell: (q) => TYPE_LABELS[q.type],
    },
    { id: "topic", header: "Topic", sort: true, cell: (q) => name(q.topic_id) },
    { id: "marks", header: "Marks", sort: true, cell: (q) => q.marks },
    { id: "verb", header: "Verb", sort: true, cell: (q) => q.verb ?? "None" },
    {
      id: "status",
      header: "Status",
      sort: true,
      cell: (q) => (
        <StatusPill
          pill={STATUS_PILL[q.status as "draft" | "live" | "retired"]}
        />
      ),
    },
    {
      id: "origin",
      header: "Origin",
      sort: true,
      cell: (q) =>
        ORIGIN_LABELS[q.origin as keyof typeof ORIGIN_LABELS] ?? q.origin,
    },
    { id: "attempts", header: "Attempts", sort: true, cell: (q) => q.attempts },
    {
      id: "avg",
      header: "Avg %",
      sort: true,
      cell: (q) => (q.avg == null ? "No marks" : `${q.avg}%`),
    },
    {
      id: "disagreements",
      header: "Check disagreements",
      sort: true,
      cell: (q) => q.disagreements,
    },
    { id: "reports", header: "Reports", sort: true, cell: (q) => q.reports },
    {
      id: "updated",
      header: "Updated",
      sort: true,
      cell: (q) => dateLabel(q.updated_at),
    },
  ];
  return result.map((c) => ({
    ...c,
    // Fit next to the sidebar at 1280: per-question stats only from 2xl.
    className: ["source", "marks", "status"].includes(c.id)
      ? undefined
      : ["type", "topic"].includes(c.id)
        ? `hidden sm:table-cell${c.id === "topic" ? " whitespace-normal min-w-40" : ""}`
        : c.id === "year"
          ? "hidden lg:table-cell"
          : "hidden 2xl:table-cell",
  }));
}

/** §4.4 list: sortable, paged, with bulk publish/retire/move/verb/delete. */
export function QuestionsTable({
  rows,
  pager,
  topics,
  status,
}: {
  rows: QuestionListRow[];
  pager: Pager;
  topics: Topic[];
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<
    | { kind: "topic" | "verb" | "delete"; ids: string[]; clear: () => void }
    | { kind: "failures"; failures: Failure[]; done: number; verb: string }
    | null
  >(null);
  const [choice, setChoice] = useState("");
  const name = (id: string) => topics.find((t) => t.id === id)?.name ?? id;
  const [parent, setParent] = useState("");

  function run(ids: string[], action: BulkAction, clear: () => void) {
    start(async () => {
      try {
        const r = await bulkQuestions(ids, action);
        const verb = {
          publish: "published",
          retire: "retired",
          delete: "deleted",
          topic: "moved",
          verb: "updated",
        }[action.kind];
        if (r.failures.length)
          setDialog({
            kind: "failures",
            failures: r.failures,
            done: r.done,
            verb,
          });
        else {
          toast.success(`${r.done} ${verb}`, {
            duration: 4000,
            action: r.undo.length
              ? {
                  label: "Undo",
                  onClick: questionUndoCallback(r.undo, start, () =>
                    router.refresh(),
                  ),
                }
              : undefined,
          });
          setDialog(null);
        }
        clear();
        router.refresh();
      } catch {
        toast.error("Couldn’t apply that. Try again.");
      }
    });
  }

  return (
    <>
      <DataTable
        label="Questions"
        columns={columns(name)}
        rows={rows}
        pager={pager}
        onRow={(q) => router.push(`${BASE}/${q.id}`)}
        bulk={(ids, clear) => (
          <>
            {status !== "live" && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(ids, { kind: "publish" }, clear)}
              >
                Publish
              </Button>
            )}
            {status !== "retired" && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(ids, { kind: "retire" }, clear)}
              >
                Retire
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChoice("");
                setDialog({ kind: "topic", ids, clear });
              }}
            >
              Move to topic
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setChoice("");
                setDialog({ kind: "verb", ids, clear });
              }}
            >
              Set verb
            </Button>
            {status === "draft" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDialog({ kind: "delete", ids, clear })}
              >
                Delete
              </Button>
            )}
          </>
        )}
      />
      <Dialog
        open={dialog?.kind === "topic" || dialog?.kind === "verb"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          {dialog && (dialog.kind === "topic" || dialog.kind === "verb") && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.kind === "topic"
                    ? "Move to topic"
                    : "Set directive verb"}
                </DialogTitle>
                <DialogDescription>
                  Applies to {dialog.ids.length} selected question
                  {dialog.ids.length === 1 ? "" : "s"}.
                </DialogDescription>
              </DialogHeader>
              {dialog.kind === "topic" ? (
                <TopicSelect
                  topics={topics}
                  parent={parent}
                  value={choice}
                  onParentChange={(id) => {
                    setParent(id);
                    setChoice("");
                  }}
                  onChange={setChoice}
                  disabled={pending}
                />
              ) : (
                <FormField label="Verb">
                  <FormSelect
                    value={choice}
                    onValueChange={setChoice}
                    options={[
                      { value: "", label: "None" },
                      ...VERBS.map((value) => ({ value, label: value })),
                    ]}
                  />
                </FormField>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={pending || (dialog.kind === "topic" && !choice)}
                  onClick={() =>
                    run(
                      dialog.ids,
                      dialog.kind === "topic"
                        ? { kind: "topic", topic_id: choice }
                        : { kind: "verb", verb: choice || null },
                      dialog.clear,
                    )
                  }
                >
                  {dialog.kind === "topic" ? "Move" : "Set verb"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={dialog?.kind === "failures"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent className="sm:max-w-lg">
          {dialog?.kind === "failures" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.done} {dialog.verb}, {dialog.failures.length} skipped
                </DialogTitle>
                <DialogDescription>Fix these and try again.</DialogDescription>
              </DialogHeader>
              <ul className="grid max-h-80 gap-2 overflow-y-auto text-sm">
                {dialog.failures.map((f) => (
                  <li key={f.id} className="rounded-xl border p-3">
                    <Link
                      prefetch={false}
                      className="font-medium underline"
                      href={`${BASE}/${f.id}`}
                    >
                      {f.id}
                    </Link>
                    : {f.problem}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          {dialog?.kind === "delete" && (
            <>
              <AlertDialogTitle>
                Delete {dialog.ids.length} draft
                {dialog.ids.length === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Only drafts with no attempts are deleted. This can’t be undone;
                live questions are retired, never deleted.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(dialog.ids, { kind: "delete" }, dialog.clear)
                  }
                >
                  Delete
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
