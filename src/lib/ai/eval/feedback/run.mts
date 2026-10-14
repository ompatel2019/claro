// --live requires explicit authorisation via AIRO5_FEEDBACK_LIVE_OK=1.
// npx tsx --conditions=react-server src/lib/ai/eval/feedback/run.mts [--dry-run | --live] [--limit=200] [--seed=20261014]
// Default dry-run reads Claro only and prints aggregate counts/cost; it never calls a model.
// No answer IDs, comment text or student data are written to disk.
import { pathToFileURL } from "node:url";
import {
  prepareTrials,
  estimateCost,
  evaluate,
  FEEDBACK_MODEL,
  VerdictSchema,
  type Loader,
  type ModelFunction,
} from "./harness";

export function assertLiveAllowed(
  live: boolean,
  approval = process.env.AIRO5_FEEDBACK_LIVE_OK,
) {
  if (live && approval !== "1")
    throw new Error(
      "Feedback eval refused: --live requires AIRO5_FEEDBACK_LIVE_OK=1.",
    );
}

// Lazy imports keep admin/model clients out of offline tests and argument parsing.
async function loadClaroRows(): Promise<unknown[]> {
  const { admin } = await import("@/utils/supabase/admin");
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await admin()
      .from("marking_examples")
      .select(
        "id,question_id,answer_text,split,accepted_tutor_comments,rejected_ai_comments,question:questions(stem,marks,stimulus,criteria)",
      )
      .order("id")
      .range(offset, offset + 999)
      .throwOnError();
    if (!data) throw new Error("Missing Claro feedback rows");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function spend() {
  const { admin } = await import("@/utils/supabase/admin");
  const { data, error } = await admin().rpc("ai_spend");
  if (error || data == null || !Number.isFinite(Number(data)))
    throw new Error("Cannot verify eval spend");
  return Number(data);
}

const model: ModelFunction = async (messages) => {
  const { callJson } = await import("../../openai");
  return callJson({
    task: "eval",
    model: FEEDBACK_MODEL,
    schema: VerdictSchema,
    messages,
    effort: "low",
  });
};

export async function main(
  args: string[],
  deps: { load: Loader; model: ModelFunction; spend: () => Promise<number> } = {
    load: loadClaroRows,
    model,
    spend,
  },
) {
  let live = false;
  let limit = 200;
  let seed = 20261014;
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.split("=")[0];
    if (seen.has(key)) throw new Error("Duplicate feedback eval flag");
    seen.add(key);
    if (arg === "--live") live = true;
    else if (arg === "--dry-run") continue;
    else if (/^--(limit|seed)=\d+$/.test(arg)) {
      const value = Number(arg.split("=")[1]);
      if (key === "--limit") limit = value;
      else seed = value;
    } else throw new Error("Use --dry-run or --live, --limit=N, --seed=N");
  }
  if (live && seen.has("--dry-run")) throw new Error("Choose one run mode");
  // Validate numeric options before even loading rows.
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit % 2 ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error("Use a positive even limit and a uint32 seed");
  assertLiveAllowed(live);
  const rows = await deps.load();
  const trials = prepareTrials(rows, { limit, seed });
  const report = {
    mode: live ? "live" : "dry-run",
    seed,
    items: trials.length,
    accepted: trials.length / 2,
    rejected: trials.length / 2,
    questions: new Set(trials.map((t) => t.item.questionId)).size,
    estimate: estimateCost(trials),
    tokenEstimate:
      "characters / 4 input + 256 output tokens per call; standard prices, no cache",
    ...(live
      ? { metrics: await evaluate(rows, trials, deps.model, deps.spend) }
      : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
