"use client";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Icon } from "@/components/icons";
import { PortalIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Kbd } from "./layout";

export type CommandRoute = { label: string; href: string; icon: Icon };
export function CommandPalette({ routes }: { routes: CommandRoute[] }) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const router = useRouter(),
    id = useId();
  const matches = routes.filter((r) =>
    `${r.label} ${r.href}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = Math.min(index, Math.max(0, matches.length - 1));
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function navigate(route: CommandRoute) {
    setOpen(false);
    router.push(route.href);
  }
  return (
    <>
      <button
        type="button"
        aria-label="Search pages (Command or Control K)"
        onClick={() => {
          setQuery("");
          setIndex(0);
          setOpen(true);
        }}
        className="text-muted-foreground md:bg-card flex size-10 min-w-0 shrink-0 items-center justify-center gap-2.5 rounded-full text-sm md:h-10 md:w-full md:max-w-[420px] md:shrink md:justify-start md:border md:px-3.5"
      >
        <PortalIcon
          size={20}
          strokeWidth={1.5}
          name="search"
          className="size-4 shrink-0"
        />
        <span className="hidden flex-1 truncate text-left md:block">
          Search questions, topics and cards
        </span>
        <span className="hidden gap-1 md:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-component="CommandPalette"
          showCloseButton={false}
          className="top-[12vh] max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">Search pages</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate the portal. Use arrow keys to move and Enter to open a
            page.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-4">
            <PortalIcon
              size={20}
              strokeWidth={1.5}
              name="search"
              className="text-muted-foreground size-4"
            />
            <input
              aria-label="Search pages"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={`${id}-list`}
              aria-activedescendant={
                matches.length ? `${id}-${selected}` : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              placeholder="Search pages"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex(
                    (selected +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      matches.length) %
                      Math.max(matches.length, 1),
                  );
                }
                if (e.key === "Enter" && matches[selected]) {
                  e.preventDefault();
                  navigate(matches[selected]);
                }
              }}
            />
            <Kbd>esc</Kbd>
          </div>
          <div
            role="listbox"
            id={`${id}-list`}
            aria-label="Pages"
            className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto p-2"
          >
            {matches.length ? (
              matches.map((r, i) => (
                <button
                  key={r.href}
                  id={`${id}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  tabIndex={-1}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => navigate(r)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm ${i === selected ? "bg-accent" : ""}`}
                >
                  <r.icon className="text-muted-foreground size-4" />
                  <span className="flex-1">{r.label}</span>
                  {i === selected && (
                    <PortalIcon
                      size={20}
                      strokeWidth={1.5}
                      name="corner-down-left"
                      className="text-muted-foreground size-3.5"
                    />
                  )}
                </button>
              ))
            ) : (
              <p className="text-muted-foreground px-3 py-10 text-center text-sm">
                No pages match “{query}”. Try another search.
              </p>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-4 border-t px-4 py-2.5 text-xs">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
            </span>
            <span>
              <Kbd>↵</Kbd> to open
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
