// One-off, re-runnable import of anonymised A1 mock-exam answers into Claro's marking_examples.
// The snapshot comes from the read-only, anonymising SELECT in /workspace/claro/a1-export/export.sql
// (run against A1 via the Supabase connector) and stays outside git:
//   npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/import-a1-examples.mts <snapshot.json> [--dry-run]
// Rows upsert on source_hash (md5 of the A1 submission and question ids), so re-runs add nothing new.
import { readFileSync } from "node:fs";
import type { MarkableQuestion } from "@/lib/marking/grade";
import evalSet from "./a1-eval-set.json";
import questionsJson from "./a1-mock-questions.json";
import { prepareA1Snapshot } from "./a1-snapshot";

const [path, ...flags] = process.argv.slice(2);
if (!path || flags.some((f) => f !== "--dry-run"))
  throw new Error("Usage: import-a1-examples.mts <snapshot.json> [--dry-run]");
const dry = flags.includes("--dry-run");
const rows = prepareA1Snapshot(
  JSON.parse(readFileSync(path, "utf8")),
  questionsJson as MarkableQuestion[],
  evalSet.map((e) => e.studentResponse),
);
const count = (split: string) => rows.filter((r) => r.split === split).length;
console.log(
  `${rows.length} answers over ${new Set(rows.map((r) => r.question_id)).size} questions: ${count("test")} test, ${count("example")} example.`,
);
if (dry) process.exit(0);
const { admin } = await import("@/utils/supabase/admin");
const db = admin();
const { data: present } = await db
  .from("questions")
  .select("id")
  .in("id", [...new Set(rows.map((r) => r.question_id))])
  .throwOnError();
const missing = [...new Set(rows.map((r) => r.question_id))].filter(
  (id) => !present?.some((p) => p.id === id),
);
if (missing.length) {
  console.error(
    `Missing Claro questions (${missing.length}): ${missing.join(", ")}`,
  );
  process.exit(1);
}
for (let i = 0; i < rows.length; i += 500)
  await db
    .from("marking_examples")
    .upsert(rows.slice(i, i + 500), {
      onConflict: "source_hash",
      ignoreDuplicates: true,
    })
    .throwOnError();
const { count: stored } = await db
  .from("marking_examples")
  .select("id", { count: "exact", head: true })
  .eq("origin", "a1")
  .throwOnError();
console.log(`Upserted. marking_examples origin a1 now has ${stored} rows.`);
