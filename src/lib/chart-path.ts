/**
 * Monotone cubic interpolation from the portal template; extrema stay at data points.
 * `floorY` is the zero baseline in SVG units (y grows downward): control points are
 * clamped to it, so the curve, which stays inside its control polygon, never dips
 * below zero between two low points.
 */
export function monotonePath(points: readonly (readonly [number, number])[]) {
  return curve(points);
}

/** The same curve, clamped so it never dips below `floorY` (the zero baseline). */
export function monotonePathAbove(
  points: readonly (readonly [number, number])[],
  floorY: number,
) {
  return curve(points, floorY);
}

function curve(
  points: readonly (readonly [number, number])[],
  floorY?: number,
) {
  const n = points.length;
  if (!n) return "";
  const dx: number[] = [],
    slopes: number[] = [],
    tangents: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    slopes[i] = (points[i + 1][1] - points[i][1]) / dx[i];
  }
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0
        ? 0
        : (3 * (dx[i - 1] + dx[i])) /
          ((2 * dx[i] + dx[i - 1]) / slopes[i - 1] +
            (dx[i] + 2 * dx[i - 1]) / slopes[i]);
  }
  const clamp = (y: number) => (floorY == null ? y : Math.min(y, floorY));
  let path = `M${points[0][0]},${clamp(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    path += `C${points[i][0] + h},${clamp(points[i][1] + h * tangents[i])} ${points[i + 1][0] - h},${clamp(points[i + 1][1] - h * tangents[i + 1])} ${points[i + 1][0]},${clamp(points[i + 1][1])}`;
  }
  return path;
}
