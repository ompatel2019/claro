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

/** Marketing-site tile icon (same file as src/app/icon.svg), rounded for UI use. */
function Tile({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG
    <img
      src="/logos/claro-tile.svg"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[22%]"
    />
  );
}

/** Claro tile + lockup; `collapsible` swaps to the tile alone in the icon-only sidebar. */
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
        <span
          className="inline-flex items-center"
          style={{ gap: Math.round(height * 0.3) }}
        >
          <Tile size={Math.round(height * 1.2)} />
          <Art kind="lockup" height={height} />
        </span>
      </span>
      {collapsible && (
        <span className="hidden group-data-[collapsible=icon]:contents">
          <Tile size={28} />
        </span>
      )}
    </span>
  );
}
