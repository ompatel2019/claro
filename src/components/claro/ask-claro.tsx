"use client";
import { useEffect, useRef, useState } from "react";
import { PortalIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
const replies: Record<string, string> = {
  "Explain the J-curve effect in two sentences":
    "A depreciation can initially worsen the trade balance because import prices rise before quantities adjust. Over time, exports become more competitive and import volumes fall, so the trade balance may improve.",
  "Why does fiscal policy have time lags?":
    "Fiscal policy has recognition, decision and implementation lags: it takes time to identify a slowdown, approve a response and deliver spending or tax changes. The effects then take time to flow through demand and employment.",
  "What should I study before my exam?":
    "Start with one topic you find difficult, attempt a short answer under timed conditions, then compare your reasoning with your notes. Finish with a quick flashcard review and leave time to rest.",
};
export function AskClaro() {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<
      { role: "user" | "claro"; text: string }[]
    >([]);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [messages, open]);
  function send(text: string) {
    if (!text.trim()) return;
    const q = text.trim();
    setMessages((m) => [
      ...m,
      { role: "user", text: q },
      {
        role: "claro",
        text:
          replies[q] ??
          "Try breaking the concept into a definition, a cause-and-effect chain and an economics example. This demo uses sample replies; choose a suggested question for a worked explanation.",
      },
    ]);
    setInput("");
  }
  return (
    <>
      <button
        data-component="AskClaroButton"
        type="button"
        aria-label="Ask Claro"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground shadow-pop fixed right-4 bottom-4 z-40 grid size-12 place-items-center rounded-full transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
      >
        <PortalIcon name="sparkles" className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-component="AskClaroSheet"
          className="w-full gap-0 sm:max-w-[420px]"
        >
          <SheetHeader className="flex-row items-center gap-3 border-b px-5 py-4 pr-12">
            <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full">
              <PortalIcon name="sparkles" className="size-4" />
            </span>
            <div>
              <SheetTitle>Ask Claro</SheetTitle>
              <SheetDescription>
                Concepts, questions, what to study next
              </SheetDescription>
            </div>
          </SheetHeader>
          <div
            ref={log}
            role="log"
            aria-label="Ask Claro conversation"
            aria-live="polite"
            className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
          >
            {messages.length ? (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "bg-primary text-primary-foreground ml-10 rounded-2xl rounded-br-md px-3.5 py-2 text-sm"
                      : "bg-muted mr-6 rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed"
                  }
                >
                  <span className="sr-only">
                    {m.role === "user" ? "You" : "Claro"}:{" "}
                  </span>
                  {m.text}
                </div>
              ))
            ) : (
              <div className="grid gap-3">
                <p className="text-muted-foreground text-sm">
                  Try one of these:
                </p>
                {Object.keys(replies).map((q) => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => send(q)}
                    className="bg-card hover:bg-accent flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-sm"
                  >
                    {q}
                    <PortalIcon
                      name="arrow-up-right"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t p-4"
          >
            <div className="bg-card focus-within:ring-ring/10 flex items-end gap-2 rounded-2xl border p-1.5 pl-3 shadow-xs focus-within:ring-[3px]">
              <textarea
                aria-label="Message Claro"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a concept, a question or what to study"
                className="[field-sizing:content] max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
              />
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send"
                disabled={!input.trim()}
              >
                <PortalIcon name="arrow-up" />
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 px-1 text-[11px]">
              Demo · sample replies only.
            </p>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
