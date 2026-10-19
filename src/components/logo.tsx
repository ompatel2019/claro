import Image from "next/image";
import { cn } from "@/lib/utils";

// Brand SVGs in public/logos (from the marketing site). White variants for dark theme.
const ART = {
  lockup: { file: "claro-lockup", ratio: 726 / 228 },
  mark: { file: "claro-mark", ratio: 90 / 100 },
};

function Art({
  kind,
  height,
  className,
}: {
  kind: keyof typeof ART;
  height: number;
  className?: string;
}) {
  const { file, ratio } = ART[kind];
  const size = { width: Math.round(height * ratio), height };
  return (
    <>
      <Image
        src={`/logos/${file}.svg`}
        alt=""
        {...size}
        unoptimized
        className={cn("dark:hidden", className)}
      />
      <Image
        src={`/logos/${file}-white.svg`}
        alt=""
        {...size}
        unoptimized
        className={cn("hidden dark:block", className)}
      />
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
