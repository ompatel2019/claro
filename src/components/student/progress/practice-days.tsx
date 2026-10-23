import Link from "next/link";
import { PortalIcon } from "@/components/icons";
import {
  dayLabel,
  heatmapWeeks,
  shade,
  type ActivityDay,
} from "@/lib/activity";

/** A small, range-aware calendar; unavailable dates never imply inactivity. */
export function PracticeDays({
  days,
  today,
  from,
}: {
  days: ActivityDay[] | null;
  today: string;
  from: string | null;
}) {
  const weeks = heatmapWeeks(today).slice(-8);
  const byDay = new Map(days?.map((d) => [d.day, d]));
  return days === null ? (
    <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
      <PortalIcon
        name="circle-alert"
        size={20}
        strokeWidth={1.5}
        className="shrink-0"
      />
      We couldn’t load your practice days. Refresh to try again.
    </p>
  ) : (
    <>
      <div
        className="progress-calendar"
        role="group"
        aria-label="Practice days over the last eight weeks"
      >
        <div className="progress-weekdays" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div className="progress-calendar-week" key={i}>
            {week.map((day, j) => {
              if (!day || (from && day < from)) return <span key={j} />;
              const d = byDay.get(day);
              return (
                <Link
                  key={day}
                  href={`/student/activity?date=${day}`}
                  prefetch={false}
                  aria-label={dayLabel(day, d?.questions, d?.cards)}
                  aria-current={day === today ? "date" : undefined}
                  className={`progress-day progress-day-${shade((d?.questions ?? 0) + (d?.cards ?? 0))}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Questions and flashcards · Today outlined
        {from && from > weeks[0][0]!
          ? " · Dates outside your range omitted"
          : ""}
      </p>
    </>
  );
}
