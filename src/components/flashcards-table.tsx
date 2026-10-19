"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkFlashcards,
  saveCard,
  undoFlashcards,
} from "@/app/admin/content/flashcards/actions";
import { DataTable, type Column } from "@/components/data-table";
import type { Pager } from "@/lib/admin";
import type { FlashcardRow } from "@/lib/admin-flashcards";
import type { CardInput } from "@/lib/flashcard-import";
import {
  CARD_FRONT_LIMIT as FRONT_MAX,
  CARD_BACK_LIMIT as BACK_MAX,
} from "@/lib/limits";
import { dateLabel, type Topic } from "@/lib/practice";
import { StatusPill, STATUS_PILL } from "./status-pill";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogFooter,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { FormSelect } from "./ui/form-select";
import { Textarea } from "./ui/textarea";
import { FormField } from "./form-field";

const KIND = { term: "Term", stat: "Stat" } as const;
const ORIGIN = { a1: "A1", claro: "Claro" } as const;
const EMPTY: CardInput = {
  id: null,
  kind: "term",
  topic_id: "",
  front: "",
  back: "",
  status: "draft",
};

function RetireConfirmation({
  open,
  count,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogTitle>
          Retire {count === 1 ? "card" : `${count} cards`}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          These cards will be hidden from students. You can publish them again.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={pending} onClick={onConfirm}>
            {pending ? "Retiring…" : "Retire"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function undoToast(
  message: string,
  previous: unknown[],
  version: string,
  refresh: () => void,
) {
  toast.success(message, {
    action: {
      label: "Undo",
      onClick: () => {
        void undoFlashcards(previous, version)
          .then((r) => {
            toast.success(
              r.done === r.total
                ? "Change undone"
                : `Restored ${r.done} cards. Later edits kept.`,
            );
            refresh();
          })
          .catch(() => toast.error("Couldn't undo. Try again."));
      },
    },
  });
}

/** Subtopics as "Topic · Subtopic", grouped by topic order (subtopic `sort` restarts per topic). */
export function subtopicOptions(topics: Topic[]) {
  const parents = new Map(topics.map((t) => [t.id, t]));
  return topics
    .filter((t) => t.parent_id && parents.has(t.parent_id))
    .sort(
      (a, b) =>
        parents.get(a.parent_id!)!.sort - parents.get(b.parent_id!)!.sort ||
        a.sort - b.sort,
    )
    .map((t) => ({
      value: t.id,
      label: `${parents.get(t.parent_id!)!.name} · ${t.name}`,
    }));
}

/** Add / Edit Dialog: Kind, Topic, Front ≤200, Back ≤1,000, Status. */
function CardDialog({
  card,
  topics,
  onClose,
}: {
  card: CardInput | null;
  topics: Topic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CardInput>(card ?? EMPTY);
  const [error, setError] = useState("");
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof CardInput>(k: K, v: CardInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  function save() {
    setError("");
    start(async () => {
      const r = await saveCard(form).catch(() => ({
        error: "Could not save. Try again.",
      }));
      if ("error" in r) {
        setConfirmRetire(false);
        return setError(r.error ?? "Could not save. Try again.");
      }
      if (
        form.status === "retired" &&
        card?.status !== "retired" &&
        r.previous.length
      )
        undoToast("Card retired", r.previous, r.version, () =>
          router.refresh(),
        );
      else toast.success("Saved");
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit card" : "Add card"}</DialogTitle>
          <DialogDescription>
            Shared Claro card. Drafts are hidden from students until published.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.status === "retired" && card?.status !== "retired")
              setConfirmRetire(true);
            else save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Kind">
              <FormSelect
                value={form.kind}
                onValueChange={(value) =>
                  set("kind", value as CardInput["kind"])
                }
                options={[
                  { value: "term", label: "Term" },
                  { value: "stat", label: "Stat" },
                ]}
              />
            </FormField>
            <FormField label="Status">
              <FormSelect
                value={form.status}
                onValueChange={(value) =>
                  set("status", value as CardInput["status"])
                }
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "live", label: "Live" },
                  { value: "retired", label: "Retired" },
                ]}
              />
            </FormField>
          </div>
          <FormField label="Topic">
            <FormSelect
              required
              value={form.topic_id}
              onValueChange={(value) => set("topic_id", value)}
              options={[
                { value: "", label: "Choose a subtopic" },
                ...subtopicOptions(topics),
              ]}
            />
          </FormField>
          <FormField
            label="Front"
            hint={`${form.front.length}/${FRONT_MAX} characters`}
          >
            <Input
              required
              maxLength={FRONT_MAX}
              value={form.front}
              onChange={(e) => set("front", e.target.value)}
            />
          </FormField>
          <FormField
            label="Back"
            hint={`${form.back.length}/${BACK_MAX} characters`}
          >
            <Textarea
              required
              rows={4}
              maxLength={BACK_MAX}
              value={form.back}
              onChange={(e) => set("back", e.target.value)}
            />
          </FormField>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : error ? "Try again" : "Save"}
            </Button>
          </DialogFooter>
        </form>
        <RetireConfirmation
          open={confirmRetire}
          count={1}
          pending={pending}
          onClose={() => setConfirmRetire(false)}
          onConfirm={save}
        />
      </DialogContent>
    </Dialog>
  );
}

/** §4.5 list: sortable, paged, bulk publish/retire/move; a row opens the edit Dialog. */
export function FlashcardsTable({
  rows,
  pager,
  topics,
  status,
}: {
  rows: FlashcardRow[];
  pager: Pager;
  topics: Topic[];
  status: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CardInput | null>(null);
  const [move, setMove] = useState<{ ids: string[]; clear: () => void } | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  const [failure, setFailure] = useState<{
    message: string;
    ids: string[];
    action: Parameters<typeof bulkFlashcards>[1];
    clear: () => void;
  } | null>(null);
  const [retiring, setRetiring] = useState<{
    ids: string[];
    clear: () => void;
  } | null>(null);
  const [pending, start] = useTransition();
  const name = (id: string | null) =>
    topics.find((t) => t.id === id)?.name ?? id ?? "";
  const run = (
    ids: string[],
    action: Parameters<typeof bulkFlashcards>[1],
    clear: () => void,
  ) =>
    start(async () => {
      setFailure(null);
      const r = await bulkFlashcards(ids, action).catch(() => ({
        error: "Try again.",
      }));
      if ("error" in r) {
        setMove(null);
        setRetiring(null);
        setFailure({
          message: r.error ?? "Could not update the cards.",
          ids,
          action,
          clear,
        });
        return;
      }
      const message = `${r.done} ${{ publish: "published", retire: "retired", topic: "moved" }[action.kind]}`;
      if (r.previous.length)
        undoToast(message, r.previous, r.version, () => router.refresh());
      else toast.success(message);
      clear();
      setMove(null);
      setRetiring(null);
      router.refresh();
    });
  const edit = (c: FlashcardRow) =>
    setEditing({
      id: c.id,
      kind: c.kind,
      topic_id: c.topic_id,
      front: c.front,
      back: c.back,
      status: c.status as CardInput["status"],
    });
  const columns: Column<FlashcardRow>[] = [
    {
      id: "front",
      className: "whitespace-normal sm:min-w-40",
      header: "Front",
      sort: true,
      cell: (c) => (
        <button
          type="button"
          className="line-clamp-2 max-w-32 text-left break-normal [overflow-wrap:anywhere] whitespace-normal sm:max-w-xs"
          onClick={() => edit(c)}
          aria-label={`Edit ${c.front}`}
        >
          {c.front}
        </button>
      ),
    },
    {
      id: "back",
      className: "hidden min-w-40 whitespace-normal sm:table-cell",
      header: "Back",
      sort: true,
      cell: (c) => (
        <span className="line-clamp-2 max-w-sm break-normal [overflow-wrap:anywhere] whitespace-normal">
          {c.back}
        </span>
      ),
    },
    {
      id: "kind",
      className: "hidden xl:table-cell",
      header: "Kind",
      sort: true,
      cell: (c) => KIND[c.kind],
    },
    {
      id: "topic",
      className: "hidden max-w-48 whitespace-normal sm:table-cell",
      header: "Topic",
      sort: true,
      cell: (c) => name(c.topic_id),
    },
    {
      id: "status",
      header: "Status",
      sort: true,
      cell: (c) => <StatusPill pill={STATUS_PILL[c.status]} />,
    },
    {
      id: "origin",
      className: "hidden xl:table-cell",
      header: "Origin",
      sort: true,
      cell: (c) => ORIGIN[c.origin as keyof typeof ORIGIN] ?? c.origin,
    },
    {
      id: "reviews",
      className: "hidden 2xl:table-cell",
      header: "Reviews",
      sort: true,
      cell: (c) => c.reviews,
    },
    {
      id: "knew",
      className: "hidden 2xl:table-cell",
      header: "% knew first try",
      sort: true,
      cell: (c) => (c.knew_first == null ? "No reviews" : `${c.knew_first}%`),
    },
    {
      id: "avg",
      className: "hidden 2xl:table-cell",
      header: "Avg rating",
      sort: true,
      cell: (c) => (c.avg == null ? "No reviews" : `${c.avg}%`),
    },
    {
      id: "updated",
      className: "hidden 2xl:table-cell",
      header: "Updated",
      sort: true,
      cell: (c) => dateLabel(c.updated_at, true),
    },
  ];
  return (
    <>
      <DataTable
        label="Flashcards"
        columns={columns}
        rows={rows}
        pager={pager}
        onRow={edit}
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
                onClick={() => setRetiring({ ids, clear })}
              >
                Retire
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setTopic("");
                setMove({ ids, clear });
              }}
            >
              Move to topic
            </Button>
          </>
        )}
      />
      {failure && (
        <Card className="border-destructive/20 bg-destructive-soft p-5">
          <p role="alert" className="text-destructive">
            {failure.message}
          </p>
          <Button
            variant="outline"
            className="w-fit"
            disabled={pending}
            onClick={() => run(failure.ids, failure.action, failure.clear)}
          >
            Try again
          </Button>
        </Card>
      )}
      <RetireConfirmation
        open={!!retiring}
        count={retiring?.ids.length ?? 0}
        pending={pending}
        onClose={() => setRetiring(null)}
        onConfirm={() =>
          retiring && run(retiring.ids, { kind: "retire" }, retiring.clear)
        }
      />
      {editing && (
        <CardDialog
          card={editing}
          topics={topics}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to topic</DialogTitle>
            <DialogDescription>
              Applies to {move?.ids.length} selected card
              {move?.ids.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Subtopic">
            <FormSelect
              value={topic}
              onValueChange={(value) => setTopic(value)}
              options={[
                { value: "", label: "Choose a subtopic" },
                ...subtopicOptions(topics),
              ]}
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMove(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !topic}
              onClick={() =>
                move &&
                run(move.ids, { kind: "topic", topic_id: topic }, move.clear)
              }
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Add card" header action. */
export function AddCard({ topics }: { topics: Topic[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add card</Button>
      {open && (
        <CardDialog
          card={EMPTY}
          topics={topics}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
