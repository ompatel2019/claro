// Offline only. Node 22: npx --no-install tsx src/lib/ai/eval/rescore.mts
// Optional --file=path accepts compact runs, rows, or an eval results JSON file.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readRescoreRuns, rescoreReport } from "./rescore.js";

export function rescoreCli(
  args: string[],
  read: (path: string | URL) => string = (path) => readFileSync(path, "utf8"),
  write: (report: string) => void = console.log,
) {
  if (args.length > 1 || args.some((arg) => !/^--file=.+$/.test(arg)))
    throw new Error("Usage: rescore.mts [--file=path]");
  const file =
    args[0]?.slice(7) ?? new URL("./sets/past-passes.json", import.meta.url);
  // Hash raw example ids from other results files in memory only.
  const input: unknown = JSON.parse(read(file), (_key, value) => {
    if (
      value &&
      typeof value === "object" &&
      typeof value.exampleId === "string"
    ) {
      value.exampleIdSha256 ??= createHash("sha256")
        .update(value.exampleId)
        .digest("hex");
      delete value.exampleId;
    }
    return value;
  });
  const flags: { exampleIdSha256: string }[] = JSON.parse(
    read(new URL("./sets/flagged-tutor-marks.json", import.meta.url)),
  );
  write(
    JSON.stringify(
      rescoreReport(
        readRescoreRuns(input),
        flags.map((row) => row.exampleIdSha256),
      ),
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  rescoreCli(process.argv.slice(2));
