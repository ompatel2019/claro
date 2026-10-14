import type { OwnQuestion } from "@/lib/single-check";
import type { Criterion } from "./grade";

type Assessment =
  | { ok: true; criteria: Criterion[]; restrictions: string }
  | {
      ok: false;
      reason: "missing" | "vague" | "inconsistent";
      message: string;
    };

/** Validate student-supplied bands without inventing a marking rubric. */
export function assessOwnCriteria(question: OwnQuestion): Assessment {
  const text = question.criteria_text?.trim();
  if (!text)
    return {
      ok: false,
      reason: "missing",
      message:
        "We can't mark this reliably: add marking criteria for your question.",
    };
  const criteria: Criterion[] = [];
  const restrictions: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (
      /^\d+\s+marks?\s+(?:maximum|cap(?:ped)?|at\s+most)\b/i.test(line.trim())
    ) {
      restrictions.push(line.trim());
      continue;
    }
    const match = line
      .trim()
      .match(
        /^(?:Band\s+)?(\d+)\s*(?:[-–—]\s*(\d+))?\s*(?:marks?\s*)?(?::|\s+[-–—])\s*(.*)$/i,
      );
    if (match)
      criteria.push({
        min: Number(match[1]),
        max: Number(match[2] ?? match[1]),
        descriptor: match[3].trim(),
      });
    else if (/^(?:Band\b|[+-]?\d)/i.test(line.trim()))
      return inconsistent(question.marks);
    else if (line.trim()) restrictions.push(line.trim());
  }
  if (!criteria.length)
    return {
      ok: false,
      reason: "vague",
      message:
        "We can't mark this reliably: give each mark band a clear description.",
    };
  criteria.sort((a, b) => a.min - b.min);
  let next = criteria[0].min === 0 ? 0 : 1;
  for (const band of criteria) {
    // A zero band is optional; positive bands must cover every available mark.
    if (band.min > band.max || band.max > question.marks || band.min !== next)
      return inconsistent(question.marks);
    next = band.max + 1;
  }
  if (next !== question.marks + 1) return inconsistent(question.marks);
  if (
    criteria.some(
      (band) => band.descriptor.split(/\s+/).filter(Boolean).length < 4,
    )
  )
    return {
      ok: false,
      reason: "vague",
      message:
        "We can't mark this reliably: describe what earns each band in more detail.",
    };
  const descriptors = criteria.map(({ descriptor }) =>
    descriptor
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (new Set(descriptors).size !== descriptors.length)
    return {
      ok: false,
      reason: "inconsistent",
      message:
        "We can't mark this reliably: give each mark band a distinct description.",
    };
  return {
    ok: true,
    criteria: criteria.reverse(),
    restrictions: restrictions.join("\n"),
  };
}

function inconsistent(marks: number): Assessment {
  return {
    ok: false,
    reason: "inconsistent",
    message: `We can't mark this reliably: your marking criteria don't add up to ${marks} marks.`,
  };
}
