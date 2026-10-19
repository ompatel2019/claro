// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { main, parseArgs, readItems, renderReport } from "./compare.mjs";
import { compareRows } from "./stats";

it("parses defaults and explicit arguments, rejecting invalid options", () => {
  expect(parseArgs(["base.json", "cand.json"])).toMatchObject({
    section: "Held-out",
    seed: 1,
    resamples: 2000,
  });
  expect(
    parseArgs([
      "base.json",
      "cand.json",
      "--section=Final",
      "--seed=42",
      "--resamples=10",
      "--json=out.json",
    ]),
  ).toMatchObject({
    section: "Final",
    seed: 42,
    resamples: 10,
    json: "out.json",
  });
  for (const option of [
    "--seed=NaN",
    "--resamples=0",
    "--resamples=1.5",
    "--section=A1",
    "--unknown=1",
    "--json=",
  ])
    expect(() => parseArgs(["a", "b", option])).toThrow();
  expect(() => parseArgs(["a"])).toThrow();
  expect(() => parseArgs(["a", "b", "--seed=1", "--seed=2"])).toThrow();
});

it("validates result shape and renders empty reports without NaNs", () => {
  expect(() => readItems('{"items":[null]}')).toThrow();
  expect(() => readItems("{}")).toThrow();
  const report = renderReport(compareRows([], [], []));
  expect(report).toContain("Excluding flagged likely tutor errors");
  expect(report).toContain("Unpaired: baseline 0, candidate 0");
  expect(report).toContain("95% percentile CIs");
  expect(report).not.toContain("NaN");
});

it("runs offline with synthetic files and writes only aggregate JSON", () => {
  const dir = mkdtempSync(path.join(process.cwd(), ".compare-test-"));
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    const row = {
      id: "synthetic-q",
      exampleId: "synthetic-answer",
      section: "Dev",
      marks: 2,
      expected: 1,
      mark: 0,
      score: { band: false },
    };
    const baseline = path.join(dir, "baseline.json"),
      candidate = path.join(dir, "candidate.json"),
      output = path.join(dir, "report.json");
    writeFileSync(baseline, JSON.stringify({ items: [row] }));
    writeFileSync(
      candidate,
      JSON.stringify({ items: [{ ...row, mark: 1, score: { band: true } }] }),
    );
    main([
      baseline,
      candidate,
      "--section=Dev",
      "--resamples=10",
      `--json=${output}`,
    ]);
    const contents = readFileSync(output, "utf8");
    expect(JSON.parse(contents).all.difference.exact).toBe(1);
    expect(contents).not.toContain("synthetic-answer");
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("Paired marking comparison: Dev"),
    );
  } finally {
    stdout.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
