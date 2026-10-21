import { cn } from "@/lib/utils";

// Approved kit SVGs; preserve their native aspect ratios and spacing.
const ART = {
  lockup: { file: "claro-logo-primary", ratio: 489.61 / 135.8 },
};

function Art({ kind, height }: { kind: keyof typeof ART; height: number }) {
  const { file, ratio } = ART[kind];
  const width = Math.max(96, height * ratio);
  const size = { width, height: width / ratio };
  return (
    <>
      {/* eslint-disable @next/next/no-img-element -- static SVGs need no optimiser */}
      <img
        src={`/logos/${file}-on-light.svg`}
        alt=""
        {...size}
        className="dark:hidden"
      />
      <img
        src={`/logos/${file}-on-dark.svg`}
        alt=""
        {...size}
        className="hidden dark:block"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </>
  );
}

/** Kit squircle icon, with its original corner shape. */
function Tile({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG
    <img
      src="/logos/claro-icon-orange.svg"
      alt=""
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

/** Claro primary logo; `collapsible` swaps to the tile alone in the icon-only sidebar. */
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
          <Tile size={28} />
        </span>
      )}
    </span>
  );
}
