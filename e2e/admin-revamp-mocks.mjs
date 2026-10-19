import bodies from "./admin-revamp-bodies.json" with { type: "json" };

export const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
export const QUESTION_ID = "hsc-2023-q24";
export const REVIEW_ID = "9c4d0f2e-7a1b-4c3d-8e5f-0a1b2c3d4e5f";

export function mockModule(path) {
  if (bodies[path]) return bodies[path];
  if (path.includes("/content/questions/actions"))
    return bodies["actions/questions"];
  if (path.includes("/content/flashcards/actions"))
    return bodies["actions/flashcards"];
  if (
    path.includes("marking/review/actions") ||
    /\/review\/actions$/.test(path)
  )
    return bodies["actions/review"];
  throw new Error("Unmocked module: " + path);
}

export function mockFile(absPath) {
  const p = absPath.replace(/\\/g, "/");
  if (p.includes("/marking/accuracy/data")) return bodies["file/accuracy-data"];
  if (p.includes("/marking/accuracy/eval")) return bodies["file/accuracy-eval"];
  if (p.includes("/marking/review/data")) return bodies["file/review-data"];
  if (p.includes("/marking/review/actions"))
    return bodies["file/review-actions"];
  if (p.includes("/marking/engine/docs")) return bodies["file/engine-docs"];
  if (p.includes("/marking/engine/store")) return bodies["file/engine-store"];
  if (p.includes("/marking/engine/compare-data"))
    return bodies["file/engine-compare"];
  if (p.includes("/marking/engine/actions"))
    return bodies["file/engine-actions"];
  throw new Error("Unmocked file: " + absPath);
}
