import Link from "next/link";

type LatestRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  score: string;
  tone: "success" | "warning" | "destructive" | null;
  when: string;
};

/** The three newest finished sessions link to Activity in the student's detail. */
export function LatestSessions({ rows }: { rows: LatestRow[] }) {
  return (
    <ul aria-label="Recent sessions" className="divide-y divide-dashed">
      {rows.slice(0, 3).map((r) => (
        <li key={r.id}>
          <Link
            href={`/admin/students/${r.user_id}?tab=sessions&session=${r.id}`}
            className="hover:bg-muted flex flex-wrap items-center gap-2 rounded-lg px-3 py-3 text-sm"
          >
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{r.name}</strong>
              <span className="text-muted-foreground">{r.kind}</span>
            </span>
            {/* Scores read like the student's Activity: plain figures, no traffic-light fills. */}
            <span
              className={
                r.tone ? "font-semibold" : "text-muted-foreground text-xs"
              }
            >
              {r.score}
            </span>
            <span className="text-muted-foreground text-xs">{r.when}</span>
            <span className="sr-only">Open Activity</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
