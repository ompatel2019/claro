import styles from "./marking-screen.module.css";
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
          viewBox="0 0 200 144"
          fill="none"
          className="h-36 w-52"
        >
          <rect
            x="24"
            y="8"
            width="152"
            height="128"
            rx="16"
            className="fill-card stroke-border"
          />
          <path
            d="M48 8v128M24 40h152M24 72h152M24 104h152"
            className="stroke-border"
          />
          <path
            d="M64 32h72M64 64h48M64 96h64"
            className="stroke-muted-foreground/40"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g
            className={`stroke-brand ${styles.pen}`}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path pathLength="1" d="m144 56 7 8 13-20" />
            <path pathLength="1" d="M64 108q30 5 64-1" />
            <path pathLength="1" d="m144 88 7 8 13-20" />
          </g>
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
