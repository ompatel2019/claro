import { History } from "@/components/icons";
import { loadSessionReport } from "@/lib/admin-data";
import { markingState } from "@/lib/feedback";
import { percentage } from "@/lib/practice";
import { mcGridRows, visibleResults } from "@/lib/results";
import { sessionItems, type SessionRow } from "@/lib/students";
import {
  ResultsAnswers,
  OverallFeedback,
  type OverallSummary,
} from "@/components/results-report";
import { EmptyState } from "@/components/empty-state";
import { StaticTable } from "@/components/static-table";
import { SpotCheck } from "@/components/student-actions";
import { Card } from "@/components/ui/card";

export async function Report({
  sessionId,
  userId,
  session,
}: {
  sessionId: string;
  userId: string;
  session: SessionRow | undefined;
}) {
  if (session && !["sprint", "single", "flashcards"].includes(session.kind))
    return <p className="text-sm">This session kind has been removed.</p>;
  const r = await loadSessionReport(sessionId, userId);
  if (!r || !session) return <p className="text-sm">Session not found.</p>;
  if (session.kind === "flashcards")
    return (
      <>
        <p className="text-sm">
          {r.finished ? "Finished" : "In progress"} · {sessionItems(session)}
        </p>
        <StaticTable
          label="Flashcard report"
          columns={[
            {
              id: "front",
              header: "Card",
              className: "max-w-48 whitespace-normal break-words",
            },
            {
              id: "answer",
              header: "Answer",
              className: "max-w-48 whitespace-normal break-words",
            },
            { id: "mark", header: "Rating", className: "hidden sm:table-cell" },
            {
              id: "back",
              header: "Model answer",
              className: "max-w-48 whitespace-normal break-words",
            },
          ]}
          rows={r.cards.map((c) => ({
            id: c.id,
            cells: {
              front: c.card?.front ?? "Deleted card",
              answer: c.answer || "Self-rated",
              mark:
                c.mark === 1 ? "Known" : c.mark === 0.5 ? "Learning" : "Missed",
              back: c.card?.back ?? "Unavailable",
            },
          }))}
        />
        {r.cards.length === 0 && (
          <EmptyState
            icon={History}
            title="No cards reviewed"
            description="This student has not reviewed a card in this session."
          />
        )}
      </>
    );
  if (!r.finished)
    return (
      <p className="text-sm">
        In progress · {session.attempts.filter((a) => a.answered).length} of{" "}
        {session.attempts.length} answered
      </p>
    );
  const rows = visibleResults(r.rows);
  const summary = session.summary as OverallSummary | null;
  const settled = !rows.some((row) => markingState(row) === "marking");
  return (
    <>
      <p className="text-sm font-medium">
        {settled && session.max_score && session.score != null
          ? `${session.score} / ${session.max_score} · ${percentage(session.score, session.max_score)}`
          : "No score yet"}
      </p>
      {session.config.question?.criteria_text && (
        <Card className="p-5">
          <h2 className="text-base font-semibold">Marking guidelines</h2>
          <p className="mt-3 whitespace-pre-wrap">
            {session.config.question.criteria_text}
          </p>
        </Card>
      )}
      <OverallFeedback summary={summary} pending={!settled} />
      <ResultsAnswers
        rows={rows}
        id={sessionId}
        name={() => ""}
        photos={r.url}
        mcGrid={mcGridRows(rows)}
        readOnly
        writtenAction={(row) =>
          markingState(row) === "marking" ? null : (
            <SpotCheck attemptId={row.attempt_id} />
          )
        }
      />
      {rows.length === 0 && (
        <EmptyState
          icon={History}
          title="No answers"
          description="There are no answers in this report."
        />
      )}
    </>
  );
}
