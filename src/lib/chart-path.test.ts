import { expect, it } from "vitest";
import { monotonePath, monotonePathAbove } from "./chart-path";

/** Every y coordinate in an SVG path built from M/C commands. */
const ys = (d: string) =>
  [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));

// Daily counts with zero days, in SVG units: y = 100 is the zero baseline.
const days = (values: number[]) =>
  values.map((v, i): [number, number] => [i * 10, 100 - v * 10]);

it("never dips below the zero baseline with a floor", () => {
  let seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647) % 10;
  for (let run = 0; run < 500; run++) {
    const values = Array.from({ length: 3 + (run % 12) }, () =>
      next() < 4 ? 0 : next(),
    );
    const d = monotonePathAbove(days(values), 100);
    expect(Math.max(...ys(d))).toBeLessThanOrEqual(100);
  }
});

it("clamps anything past the floor and keeps the x positions", () => {
  // Rounding or a stray negative must not draw under the axis.
  const d = monotonePathAbove(
    [
      [0, 100],
      [10, 103],
      [20, 40],
    ],
    100,
  );
  expect(Math.max(...ys(d))).toBe(100);
  expect(d.startsWith("M0,100")).toBe(true);
  expect(d.endsWith(" 20,40")).toBe(true);
});

it("leaves paths above the floor untouched", () => {
  const pts: [number, number][] = [
    [0, 50],
    [10, 20],
    [20, 40],
  ];
  expect(monotonePathAbove(pts, 100)).toBe(monotonePath(pts));
});
