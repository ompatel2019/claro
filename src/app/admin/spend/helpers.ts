/** Totals, to the cent. */
export const usd = (value: number) => `$${value.toFixed(2)}`;
/** Per-call and per-answer averages: one fixed precision so columns line up. */
export const avgUsd = (value: number) =>
  !Number.isFinite(value)
    ? "—"
    : value > 0 && value < 0.001
      ? "<$0.001"
      : `$${value.toFixed(3)}`;
