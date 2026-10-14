import { expect, it } from "vitest";
import { disputeNoteSchema, rejectionRate } from "./disputes";
it.each([
  null,
  {},
  { note: "          " },
  { note: "too short" },
  { note: "x".repeat(1001) },
])("rejects invalid written reasons %j", (body) =>
  expect(disputeNoteSchema.safeParse(body).success).toBe(false),
);
it.each([10, 1000])(
  "accepts the %i character boundary and trims whitespace",
  (n) =>
    expect(
      disputeNoteSchema.parse({ note: `  ${"x".repeat(n)}  ` }).note,
    ).toHaveLength(n),
);
it("uses only resolved disputes in rejection rates", () => {
  expect(rejectionRate({ resolved: 0, rejected: 0 })).toBeNull();
  expect(rejectionRate({ resolved: 3, rejected: 1 })).toBe(33);
  expect(rejectionRate({ resolved: 3, rejected: 3 })).toBe(100);
});
