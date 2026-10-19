import { cn } from "@/lib/utils";

// Brand SVGs in public/logos (from the marketing site). White variants for dark theme.
const ART = {
  lockup: { file: "claro-lockup", ratio: 726 / 228 },
  mark: { file: "claro-mark", ratio: 90 / 100 },
};

function Art({ kind, height }: { kind: keyof typeof ART; height: number }) {
  const { file, ratio } = ART[kind];
  const size = { width: Math.round(height * ratio), height };
  return (
    <>
      {/* eslint-disable @next/next/no-img-element -- static SVGs need no optimiser */}
      <img
        src={`/logos/${file}.svg`}
        alt=""
        {...size}
        className="dark:hidden"
      />
      <img
        src={`/logos/${file}-white.svg`}
        alt=""
        {...size}
        className="hidden dark:block"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </>
  );
}

/** Claro lockup; `collapsible` swaps to the mark in the icon-only sidebar. */
export function Logo({
  height = 28,
  collapsible = false,
}: {
  height?: number;
  collapsible?: boolean;
}) {
  return (
    <span role="img" aria-label="Claro" className="inline-flex shrink-0">
      <span
        className={cn(
          "contents",
          collapsible && "group-data-[collapsible=icon]:hidden",
        )}
      >
        <Art kind="lockup" height={height} />
      </span>
      {collapsible && (
        <span className="hidden group-data-[collapsible=icon]:contents">
          <Art kind="mark" height={24} />
        </span>
      )}
    </span>
  );
}
