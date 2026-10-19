"use client";
import { homeExamPrompt } from "@/lib/home";
import { sydneyToday } from "@/lib/flashcards";
import { useState } from "react";
import { askClaro } from "@/components/claro/ask-claro";
import { PortalIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
const suggestions = [
  "Explain the J-curve effect in two sentences",
  "Why does fiscal policy have time lags?",
];
export function HomeAsk({ today = sydneyToday() }: { today?: string }) {
  const [text, setText] = useState("");
  return (
    <Card className="gap-4 p-5 xl:min-h-[390px]">
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <PortalIcon
            name="sparkles"
            className="text-muted-foreground size-4"
          />
          Ask Claro
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Explain a concept, check your thinking or plan your next session.
        </p>
      </div>
      <div className="grid gap-2">
        {[...suggestions, homeExamPrompt(today)].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => askClaro(q)}
            className="hover:bg-accent flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium"
          >
            {q}
            <PortalIcon
              name="arrow-up-right"
              className="text-muted-foreground size-3.5 shrink-0"
            />
          </button>
        ))}
      </div>
      <form
        className="mt-auto pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            askClaro(text.trim());
            setText("");
          }
        }}
      >
        <div className="flex h-10 items-center gap-2 rounded-full border pr-1 pl-3 shadow-xs">
          <PortalIcon
            name="message-circle"
            className="text-muted-foreground size-4"
          />
          <input
            aria-label="Ask anything"
            placeholder="Ask anything"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          <button
            aria-label="Send to Claro"
            type="submit"
            className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-full"
          >
            <PortalIcon name="arrow-up" className="size-4" />
          </button>
        </div>
      </form>
    </Card>
  );
}
