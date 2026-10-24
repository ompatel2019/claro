/** Pure maths behind the admin dashboard's numbers. */

/** Month-to-date spend against the cap: one period for the number and the meter. */
export function spendMeter(month: number, cap: number) {
  const spent = Number.isFinite(month) ? Math.max(0, month) : 0;
  const pct = cap > 0 ? Math.min(100, Math.round((100 * spent) / cap)) : 0;
  return {
    pct,
    text: `$${spent.toFixed(2)} of $${cap.toFixed(0)}`,
  };
}

/** The last 7 days' total and its change on the 7 days before, from daily points. */
export function lastWeek(points: readonly { value: number }[]) {
  const sum = (xs: readonly { value: number }[]) =>
    xs.reduce((total, p) => total + p.value, 0);
  const now = sum(points.slice(-7));
  const before = points.length >= 14 ? sum(points.slice(-14, -7)) : null;
  return { now, delta: before == null ? null : now - before };
}
