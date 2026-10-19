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
    <Card className="min-h-36 justify-center px-5">
      <div className="flex items-center gap-4">
        {score && (
          <ScoreRing
            score={score.mark}
            of={score.max}
            size={80}
            showPct={false}
          />
        )}
        <div className="min-w-0">
          <p className="text-muted-foreground text-[13px]">{label}</p>
          <p className="mt-3 text-[28px] leading-none font-bold tracking-tight tabular-nums">
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
