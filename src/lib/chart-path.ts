/** Monotone cubic interpolation from the portal template; extrema stay at data points. */
export function monotonePath(points: readonly (readonly [number, number])[]) {
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
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    path += `C${points[i][0] + h},${points[i][1] + h * tangents[i]} ${points[i + 1][0] - h},${points[i + 1][1] - h * tangents[i + 1]} ${points[i + 1][0]},${points[i + 1][1]}`;
  }
  return path;
}
