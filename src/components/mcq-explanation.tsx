import { readMcqExplanation, type McqExplanation } from "@/lib/mcq-explanation";
import { RichText } from "./rich-text";

/** Same concept-first explanation in check mode, results and question previews. */
export function McqExplanationView({
  explanation,
  correctIndex,
}: {
  explanation: string | McqExplanation;
  correctIndex?: number | null;
}) {
  const structured =
    readMcqExplanation(explanation) ?? readMcqExplanation(explanation, true);
  if (!structured)
    return typeof explanation === "string" ? (
      <RichText text={explanation} />
    ) : null;
  const correct = correctIndex == null ? null : "ABCD"[correctIndex];
  const notes = Object.entries(structured.distractors)
    .filter(([option, text]) => option !== correct && text)
    .sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="min-w-0 space-y-3 break-words">
      <RichText text={structured.concept} />
      <div className="space-y-1">
        {correct && (
          <p className="font-semibold">Thus the answer is {correct}.</p>
        )}
        <RichText text={structured.why_correct} />
      </div>
      {notes.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">Why the other options are wrong</p>
          <ul className="space-y-2">
            {notes.map(([option, text]) => (
              <li key={option} className="flex items-start gap-2">
                <span className="shrink-0 font-semibold">{option}.</span>
                <RichText className="min-w-0 flex-1" text={text!} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
