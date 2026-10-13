type Sample = { answered: number; sessions?: number; pct: number | null };
export function hasTopicHistory(t: Pick<Sample, "answered" | "sessions">) {
  return (
    Number.isInteger(t.answered) &&
    t.answered >= 3 &&
    Number.isInteger(t.sessions) &&
    (t.sessions ?? 0) >= 2
  );
}
export function isWeakTopic(t: Sample) {
  return (
    hasTopicHistory(t) &&
    t.pct !== null &&
    Number.isFinite(t.pct) &&
    t.pct >= 0 &&
    t.pct < 60
  );
}
export function weakTopicUnlock(t: Sample & { name: string }) {
  if (hasTopicHistory(t)) return null;
  const remaining = Math.max(0, 3 - t.answered);
  return remaining
    ? `Answer ${remaining} more ${remaining === 1 ? "question" : "questions"} in ${t.name} across at least 2 sessions to unlock weak spots.`
    : `Practise ${t.name} in another session to unlock weak spots.`;
}
