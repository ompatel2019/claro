// Read-only local results fixtures: no database, model or external requests.
import { createServer } from "node:http";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.test",
  app_metadata: {},
  user_metadata: {},
};
const criteria = [
  {
    min: 3,
    max: 5,
    descriptor: "Explains the economic mechanism with evidence.",
  },
  { min: 1, max: 2, descriptor: "Identifies a relevant economic effect." },
];
const row = (position, mark, type, bands = criteria) => ({
  id: `attempt-${position}`,
  attempt_id: `attempt-${position}`,
  position,
  question_id: `question-${position}`,
  type,
  marks: type === "mcq" ? 1 : 5,
  max_marks: type === "mcq" ? 1 : 5,
  mark,
  status: "marked",
  check_status: "agreed",
  source: "Synthetic fixture",
  stem: `Explain inflation ${position}.`,
  topic_id: "inflation",
  options: type === "mcq" ? ["Prices rise", "Prices fall"] : null,
  choice_index: 0,
  correct_index: 0,
  answer_text: "Demand increases prices.",
  image_paths: [],
  transcript: null,
  review: null,
  stimulus: null,
  year: 2026,
  flagged: false,
  band: "Explains the economic mechanism with evidence.",
  criteria: bands,
  sample_answer: "Higher demand increases prices when supply is constrained.",
  explanation: "Prices rise.",
  feedback: {
    comments: [
      {
        kind: "fix",
        quote: "Demand",
        start: 0,
        tag: "Analysis",
        body: "Explain the link to supply.",
        next_mark: "Stored per-comment advice.",
      },
    ],
    next_mark_line: "Aggregate advice stays visible.",
    better_answer_outline: ["Explain demand relative to supply."],
  },
});
const rows = [
  row(1, 1, "mcq"),
  row(2, 3, "short", [criteria[0]]),
  row(3, 5, "short"),
];
// 0007/0008: time-driven marking. marking (0-3 s) -> all marked, finished_at unset
// -> finished (0007 after 8 s on its own; 0008 only once /__finish/<id> is hit, like
// the server finishing a session whose marking tab was closed).
const live = new Map();
const phaseOf = (id) => {
  const s = live.get(id);
  if (!s) return null;
  const age = Date.now() - s.t;
  if (age < 3000) return "marking";
  if (id.endsWith("0007") && age >= 8000) return "finished";
  if (id.endsWith("0008") && s.finished) return "finished";
  return "marked";
};
createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const control = url.pathname.match(/^\/__(reset|finish)\/(.+)$/);
  if (control) {
    if (control[1] === "reset") live.set(control[2], { t: Date.now() });
    else if (live.has(control[2])) live.get(control[2]).finished = true;
    response.end("{}");
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Content-Range", "*/0");
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    url.pathname !== "/rest/v1/rpc/session_review"
  ) {
    response.writeHead(403);
    response.end(JSON.stringify({ error: "Writes and marking forbidden" }));
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const id =
    url.searchParams.get("id")?.replace("eq.", "") ??
    url.searchParams.get("session_id")?.replace("eq.", "") ??
    (body ? JSON.parse(body).p_session : "");
  // 0006: finished_at not yet set while Finish marks one answer (claim in flight).
  const timed = id?.endsWith("0007") || id?.endsWith("0008");
  if (timed && !live.has(id)) live.set(id, { t: Date.now() });
  const phase = timed ? phaseOf(id) : null;
  const finishing = id?.endsWith("0006") || (timed && phase !== "finished");
  const single = id?.endsWith("0002") || id?.endsWith("0003");
  const selected = single
    ? [id.endsWith("0002") ? rows[2] : rows[1]]
    : timed
      ? phase === "marking"
        ? [rows[0], rows[1], { ...rows[2], status: "marking", mark: null }]
        : rows
      : finishing
        ? [rows[0], { ...rows[2], status: "marking", mark: null }]
        : id?.endsWith("0005")
          ? [rows[0], rows[1], { ...rows[2], status: "marking", mark: null }]
          : rows;
  let data = [];
  if (url.pathname === "/auth/v1/user") data = user;
  else if (url.pathname === "/rest/v1/profiles")
    data = {
      ...user,
      full_name: "Test student",
      year_level: 12,
      role: "student",
    };
  else if (url.pathname === "/rest/v1/topics")
    data = [
      { id: "inflation", parent_id: "issues", name: "Inflation", sort: 1 },
    ];
  else if (url.pathname === "/rest/v1/flashcards")
    data = [{ topic_id: "inflation" }];
  else if (
    url.pathname === "/rest/v1/sessions" &&
    url.searchParams.has("id") &&
    !url.searchParams.get("id").startsWith("neq.")
  )
    data = {
      id,
      user_id: user.id,
      kind: single ? "single" : "sprint",
      config: {
        mode: "mixed",
        feedback: "end",
        timed: false,
        subtopics: ["inflation"],
      },
      started_at: "2026-10-18T02:34:00Z",
      finished_at: finishing ? null : "2026-10-18T02:40:00Z",
      elapsed_s: 360,
      score: 9,
      max_score: 11,
      summary:
        id.endsWith("0004") || id.endsWith("0005")
          ? null
          : {
              strengths: ["Stored strength."],
              top_fixes: ["Stored fix."],
              next_steps: ["Practise explaining the mechanism."],
            },
    };
  else if (url.pathname === "/rest/v1/rpc/session_review") data = selected;
  else if (
    url.pathname === "/rest/v1/attempts" &&
    url.searchParams.has("session_id")
  )
    data = selected.map((r) => ({
      ...r,
      claimed_at: r.status === "marking" ? new Date().toISOString() : null,
      question: r,
    }));
  response.end(request.method === "HEAD" ? undefined : JSON.stringify(data));
}).listen(54328, "127.0.0.1");
