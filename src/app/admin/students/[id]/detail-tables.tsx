import Link from "next/link";
import type { loadStudentDetail } from "@/lib/admin-data";
import { FEEDBACK_KIND, pctOf } from "@/lib/admin";
import { dateLabel, scoreTone } from "@/lib/practice";
import { ServerTable } from "@/components/static-table-server";
import type { StaticRow } from "@/components/static-table";
import { StatusPill, STATUS_PILL } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";

type StudentDetail = NonNullable<Awaited<ReturnType<typeof loadStudentDetail>>>;
type TableProps = {
  d: StudentDetail;
  sp: Record<string, string | undefined>;
};

const REASON = {
  check_disagreed: "Check disagreed",
  student_dispute: "Student dispute",
  spot_check: "Spot check",
} as const;

export function TopicsTab({ d, sp }: TableProps) {
  const topicRow = (t: (typeof d.topics)[number]): StaticRow => {
    const p = d.progress.find((p) => p.topic_id === t.id);
    const earned = Number(p?.earned ?? 0),
      possible = Number(p?.possible ?? 0);
    const v = pctOf(earned, possible);
    return {
      id: t.id,
      cells: {
        topic: t.name,
        answered: p?.answered ?? 0,
        marks: `${earned} / ${possible}`,
        pct:
          v == null ? (
            "Not started"
          ) : (
            <Badge variant={scoreTone(v)}>{v}%</Badge>
          ),
        last: p?.last_answered ? dateLabel(p.last_answered, true) : "Never",
      },
      keys: {
        topic: t.name,
        answered: Number(p?.answered ?? 0),
        marks: earned,
        pct: v,
        last: p?.last_answered ?? null,
      },
    };
  };

  return (
    <ServerTable
      params={sp}
      label="Marks by topic"
      columns={[
        {
          id: "topic",
          header: "Topic",
          sortable: true,
          className:
            "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
        },
        {
          id: "answered",
          header: "Answered",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "marks",
          header: "Marks",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "pct",
          header: "%",
          sortable: true,
          className: "max-sm:px-2",
        },
        {
          id: "last",
          header: "Last practised",
          sortable: true,
          className: "hidden sm:table-cell",
        },
      ]}
      rows={d.topics
        .filter((t) => !t.parent_id)
        .map((t) => ({
          ...topicRow(t),
          children: d.topics
            .filter((child) => child.parent_id === t.id)
            .map(topicRow),
        }))}
    />
  );
}

export function ReviewsTab({ d, sp, base }: TableProps & { base: string }) {
  return (
    <ServerTable
      params={sp}
      label="Reviews and disputes"
      columns={[
        {
          id: "when",
          header: "When",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "reason",
          header: "Reason",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "question",
          header: "Question",
          sortable: true,
          className:
            "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
        },
        {
          id: "marks",
          header: "AI → final",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "status",
          header: "Status",
          sortable: true,
          className: "max-sm:px-2",
        },
      ]}
      rows={d.reviews.map((r) => ({
        id: r.id,
        cells: {
          when: dateLabel(r.created_at, true),
          reason: REASON[r.reason as keyof typeof REASON] ?? r.reason,
          question: r.attempt?.session_id ? (
            <Link
              className="underline"
              href={`${base}?tab=sessions&session=${r.attempt.session_id}`}
            >
              {r.attempt.question?.source ??
                r.attempt?.question?.stem?.slice(0, 60) ??
                "Question"}
            </Link>
          ) : (
            "Question"
          ),
          marks: `${r.ai_mark ?? "No AI mark"} → ${r.final_mark ?? "pending"}`,
          status: (
            <StatusPill
              pill={STATUS_PILL[r.status as keyof typeof STATUS_PILL]}
            />
          ),
        },
        keys: {
          when: r.created_at,
          reason: REASON[r.reason as keyof typeof REASON] ?? r.reason,
          status: r.status,
          question: `${r.attempt?.question?.source ?? ""} ${r.attempt?.question?.stem ?? ""}`,
          marks: `${r.ai_mark ?? "No AI mark"} ${r.final_mark ?? "pending"}`,
        },
      }))}
    />
  );
}

export function FeedbackTab({ d, sp }: TableProps) {
  return (
    <ServerTable
      params={sp}
      paramPrefix="feedback_"
      label="Feedback"
      columns={[
        {
          id: "when",
          header: "Date",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "kind",
          header: "Kind",
          sortable: true,
          className: "hidden sm:table-cell",
        },
        {
          id: "message",
          header: "Message",
          sortable: true,
          className:
            "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
        },
        {
          id: "status",
          header: "Status",
          sortable: true,
          className: "max-sm:px-2",
        },
      ]}
      rows={d.feedback.map((f) => ({
        id: f.id,
        cells: {
          when: dateLabel(f.created_at, true),
          kind: FEEDBACK_KIND[f.kind as keyof typeof FEEDBACK_KIND] ?? f.kind,
          message: (
            <Link
              className="line-clamp-1 max-w-md whitespace-normal underline"
              href={`/admin/feedback?status=${f.status}&id=${f.id}`}
            >
              {f.message}
            </Link>
          ),
          status: (
            <StatusPill
              pill={STATUS_PILL[f.status as keyof typeof STATUS_PILL]}
            />
          ),
        },
        keys: {
          when: f.created_at,
          kind: FEEDBACK_KIND[f.kind as keyof typeof FEEDBACK_KIND] ?? f.kind,
          status: f.status,
          message: f.message,
        },
      }))}
    />
  );
}
