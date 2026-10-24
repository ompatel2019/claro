import { expect, it } from "vitest";
import { clampSpot } from "./calculator";

const size = { width: 260, height: 380 };
const phone = { width: 390, height: 844 };

it("pulls a spot saved on a wider window back on screen", () => {
  expect(clampSpot({ x: 1180, y: 900 }, size, phone)).toEqual({
    x: 130,
    y: 464,
  });
  expect(clampSpot({ x: -40, y: -10 }, size, phone)).toEqual({ x: 0, y: 0 });
  expect(clampSpot({ x: 50, y: 60 }, size, phone)).toEqual({ x: 50, y: 60 });
});

it("ignores junk so the panel falls back to its default corner", () => {
  for (const junk of [null, "x", { x: "1", y: 2 }, { x: NaN, y: 0 }, {}])
    expect(clampSpot(junk, size, phone)).toBeNull();
});
