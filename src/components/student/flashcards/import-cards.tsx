"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  importMyCards,
  loadMyCardFronts,
  deleteMyCards,
} from "@/app/(app)/flashcards/my-card-actions";
import { Choose, KINDS, topicOptions } from "@/components/card-editor";
import { Button } from "@/components/claro/controls";
import { PortalIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FilePicker } from "@/components/ui/file-picker";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { normaliseFront, type CardInput } from "@/lib/card-import";
import {
  parseCardText,
  type CardTextSource,
} from "@/lib/flashcard-text-import";
import { CARD_IMPORT_BYTE_LIMIT } from "@/lib/limits";
import { plural, type Topic } from "@/lib/practice";
import { cn } from "@/lib/utils";

const guides = {
  quizlet: {
    steps: [
      "On the Quizlet website, open Your library, then Flashcard sets, and open your set.",
      "Select the more menu (…), then Export.",
      "Keep Tab between term and definition, and New line between cards.",
      "Select Copy text, then paste it below.",
    ],
    note: "Quizlet only exports sets you created, on the website. Images aren't included.",
  },
  anki: {
    steps: [
      "In Anki on your computer, choose File, then Export.",
      "Set Export format to Notes in Plain Text (.txt) and pick the deck.",
      "Untick Include HTML and media references, and untick Include tags.",
      "Export, then upload the .txt file below.",
    ],
    note: "Claro uses the first two fields of each note as the front and back. Images and audio aren't imported.",
  },
};

export function ImportCards({ topics }: { topics: Topic[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PortalIcon name="tray" size={20} />
        Import
      </Button>
      {open && <ImportDialog topics={topics} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({
  topics,
  onClose,
}: {
  topics: Topic[];
  onClose: () => void;
}) {
  const [source, setSource] = useState<CardTextSource | null>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof parseCardText
  > | null>(null);
  const [fronts, setFronts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<CardInput["kind"]>("term");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  useEffect(() => {
    startLoading(async () => {
      try {
        const result = await loadMyCardFronts();
        if (result.error) toast.error(result.error);
        else {
          setFronts(result.fronts ?? []);
          setLoaded(true);
        }
      } catch {
        toast.error("Couldn't load your cards. Try again.");
      }
    });
  }, []);
  const own = new Set(fronts.map(normaliseFront));
  const seen = new Set<string>();
  const skipped = [...(preview?.errors ?? [])];
  const ready = (preview?.cards ?? []).filter((card) => {
    const key = normaliseFront(card.front);
    const message = own.has(key)
      ? "Already in your cards"
      : seen.has(key)
        ? "Repeated in this paste"
        : null;
    seen.add(key);
    if (message) skipped.push({ line: card.line, message });
    return !message;
  });
  skipped.sort((a, b) => a.line - b.line);
  function submit() {
    setError("");
    startTransition(async () => {
      try {
        const result = await importMyCards(
          ready.map(({ front, back }) => ({
            front,
            back,
            topic_id: topic,
            kind,
          })),
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        const ids = result.ids ?? [];
        toast.success(`${plural(ids.length, "card")} imported.`, {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                const undone = await deleteMyCards(ids);
                if (undone.error) toast.error(undone.error);
                else toast.success("Import undone.", { duration: 4000 });
              } catch {
                toast.error("Couldn't undo the import. Try again.");
              }
            },
          },
        });
        onClose();
      } catch {
        setError("Couldn't import your cards. Try again.");
      }
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !pending && !loading) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Import cards</DialogTitle>
        <DialogDescription>
          {preview
            ? "Review your cards and choose a subtopic."
            : "Bring your Quizlet or Anki cards into Claro."}
        </DialogDescription>
        {!preview ? (
          <div className="grid min-w-0 gap-4">
            <div
              role="radiogroup"
              aria-label="Import source"
              className="grid grid-cols-2 gap-3"
            >
              {(["quizlet", "anki"] as const).map((value, index, all) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={source === value}
                  tabIndex={(source ?? "quizlet") === value ? 0 : -1}
                  onClick={() => {
                    setSource(value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    const step = {
                      ArrowRight: 1,
                      ArrowDown: 1,
                      ArrowLeft: -1,
                      ArrowUp: -1,
                    }[event.key];
                    if (!step) return;
                    event.preventDefault();
                    const next = all[(index + step + all.length) % all.length];
                    setSource(next);
                    setError("");
                    const group = event.currentTarget.parentElement;
                    group
                      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                      [all.indexOf(next)]?.focus();
                  }}
                  className={cn(
                    "bg-card rounded-2xl border p-4 text-left font-semibold focus-visible:ring-2",
                    source === value &&
                      "border-primary ring-primary ring-2 ring-offset-2",
                  )}
                >
                  {value === "quizlet" ? "Quizlet" : "Anki"}
                </button>
              ))}
            </div>
            {source && (
              <>
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {guides[source].steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="text-muted-foreground text-xs">
                  {guides[source].note}
                </p>
                <label className="grid min-w-0 gap-2 text-sm">
                  Paste text
                  <Textarea
                    aria-label="Paste text"
                    rows={6}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>
                <FilePicker
                  label="Upload a .txt or .tsv file"
                  accept=".txt,.tsv,text/plain,text/tab-separated-values"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > CARD_IMPORT_BYTE_LIMIT) {
                      setError("Files must be 1 MB or smaller.");
                      return;
                    }
                    setError("");
                    try {
                      setText(await file.text());
                    } catch {
                      setError("Couldn't read this file. Try again.");
                    }
                  }}
                />
                <Button
                  disabled={loading}
                  onClick={() => {
                    setError("");
                    try {
                      setPreview(parseCardText(text, source));
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                >
                  Preview
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <p aria-live="polite">
              {plural(ready.length, "card")} ready ·{" "}
              {plural(skipped.length, "line")} skipped
            </p>
            {skipped.length > 0 && (
              <ul className="text-muted-foreground space-y-1 text-sm">
                {skipped.slice(0, 5).map(({ line, message }) => (
                  <li key={line}>
                    Line {line}: {message}
                  </li>
                ))}
                {skipped.length > 5 && <li>and {skipped.length - 5} more</li>}
              </ul>
            )}
            <Table aria-label="Import preview">
              <TableHeader>
                <TableRow>
                  <TableHead>Front</TableHead>
                  <TableHead>Back</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ready.slice(0, 5).map((card) => (
                  <TableRow key={card.line}>
                    {(["front", "back"] as const).map((side) => (
                      <TableCell key={side}>
                        <span className="line-clamp-2 max-w-64 [overflow-wrap:anywhere] whitespace-normal">
                          {card[side]}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Choose
              label="Subtopic"
              placeholder="Choose a subtopic"
              value={topic}
              options={topicOptions(topics.filter((topic) => topic.parent_id))}
              onChange={setTopic}
            />
            <Choose
              label="Kind"
              value={kind}
              options={KINDS}
              onChange={(value) => setKind(value as CardInput["kind"])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setPreview(null);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button
                disabled={pending || !loaded || !topic || !ready.length}
                onClick={submit}
              >
                {pending
                  ? "Importing…"
                  : `Import ${plural(ready.length, "card")}`}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
