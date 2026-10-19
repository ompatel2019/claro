import { Logo } from "./logo";

/** Shared blocking presentation while a marking submission is pending. */
export function MarkingScreen({ single = false }: { single?: boolean }) {
  return (
    <div
      className="bg-background fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto p-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <Logo height={32} />
        <svg
          aria-hidden="true"
          viewBox="0 0 120 100"
          fill="none"
          className="text-primary h-28 w-36 motion-safe:animate-pulse motion-reduce:animate-none"
        >
          <rect
            x="30"
            y="8"
            width="60"
            height="60"
            rx="18"
            fill="currentColor"
          />
          <path
            d="M70 28a15 15 0 1 0 0 20"
            stroke="var(--primary-foreground)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M26 88h68"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="4 9"
          />
        </svg>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">
            {single ? "Marking your answer" : "Marking your answers"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {single
              ? "We’re checking your answer against the guidelines and preparing your feedback."
              : "We’re checking your answers and preparing your feedback."}{" "}
            This can take a little while.
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          Your results will open here when ready.
        </p>
      </div>
    </div>
  );
}
