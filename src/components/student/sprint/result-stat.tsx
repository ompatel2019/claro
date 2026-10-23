import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { DeltaPill, ScoreRing } from "@/components/claro/data-display";

/** Results metrics use only the session tallies and the caller's historical average. */
export function ResultStat({
  label,
  value,
  comparison,
  neutral = false,
  score,
}: {
  label: ReactNode;
  value: ReactNode;
  comparison: string | null;
  neutral?: boolean;
  score?: { mark: number; max: number };
}) {
  const match = comparison?.match(/^([+−])(\d+)(.*?) vs your average$/);
  return (
    <Card
      className={
        score
          ? "col-span-full min-h-0 justify-center px-5 sm:min-h-36 xl:col-span-1"
          : "min-h-0 justify-center px-3 sm:px-5"
      }
    >
      <div className="flex items-center gap-4">
        {score && (
          <ScoreRing
            score={score.mark}
            of={score.max}
            size={120}
            showPct={false}
          />
        )}
        <div className="min-w-0">
          <p className="text-muted-foreground text-[13px]">{label}</p>
          <p
            className={`${score ? "mt-1" : "mt-3"} text-2xl leading-none font-bold tracking-tight tabular-nums sm:text-[28px]`}
          >
            {value}
          </p>
          {comparison && (
            <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {match ? (
                <>
                  <DeltaPill
                    delta={Number(match[2]) * (match[1] === "−" ? -1 : 1)}
                    unit={match[3]}
                    neutral={neutral}
                  />
                  vs your average
                </>
              ) : (
                comparison
              )}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
