import type { EvalSet } from "@/lib/ai/eval/sets";

export function parseArgs(args: string[]) {
  const dry = args.includes("--dry-run");
  const limit = Number(
    args.find((a) => a.startsWith("--limit="))?.slice(8) ?? Infinity,
  );
  const label = args.find((a) => a.startsWith("--label="))?.slice(8) ?? "";
  const selectedItems =
    args
      .find((a) => a.startsWith("--items="))
      ?.slice(8)
      .split(",")
      .map(Number) ?? null;
  const set = args.find((a) => a.startsWith("--set="))?.slice(6) as
    EvalSet | undefined;
  if (
    args.some(
      (a) =>
        !/^(--dry-run|--limit=\d+|--items=\d+(,\d+)*|--label=.*|--set=(dev|final))$/.test(
          a,
        ),
    ) ||
    (args.some((a) => a.startsWith("--limit=")) &&
      (!Number.isSafeInteger(limit) || limit < 1)) ||
    selectedItems?.some((index) => !Number.isSafeInteger(index)) ||
    (selectedItems !== null && args.some((a) => a.startsWith("--limit="))) ||
    args.filter((a) => a.startsWith("--set=")).length > 1
  ) {
    throw new Error(
      "Use --dry-run, --limit=N (positive integer per section), --items=0,1,... (non-negative integer indices; cannot combine with --limit), --label=text, --set=dev|final",
    );
  }
  return { dry, limit, label, selectedItems, set };
}
