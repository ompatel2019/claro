import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { rescoreCli } from "./rescore.mjs";

it("reads only local fixtures, hashes example ids and outputs aggregate JSON", () => {
  const hash = createHash("sha256").update("synthetic-example").digest("hex");
  const reads: (string | URL)[] = [];
  let output = "";
  rescoreCli(
    ["--file=fixture.json"],
    (path) => {
      reads.push(path);
      return String(path).endsWith("flagged-tutor-marks.json")
        ? JSON.stringify([{ exampleIdSha256: hash }])
        : JSON.stringify({
            items: [
              {
                id: "question",
                exampleId: "synthetic-example",
                marks: 2,
                expected: 2,
                mark: 1,
                check: { marks: [1, 2, 1] },
              },
            ],
          });
    },
    (text) => {
      output = text;
    },
  );
  expect(reads).toHaveLength(2);
  expect(reads[0]).toBe("fixture.json");
  const report = JSON.parse(output);
  expect(report.runs[0].flagged).toBe(1);
  expect(report.runs[0].missingExampleHash).toBe(0);
  expect(report.runs[0].withoutFlagged[0].n).toBe(0);
  expect(output).not.toContain("synthetic-example");
  expect(output).not.toContain(hash);
});

it("defaults to saved passes and rejects unsupported arguments before reading", () => {
  const reads: string[] = [];
  rescoreCli(
    [],
    (path) => {
      reads.push(String(path));
      return String(path).endsWith("past-passes.json")
        ? '{"fixture": []}'
        : "[]";
    },
    () => {},
  );
  expect(reads[0]).toMatch(/\/sets\/past-passes.json$/);
  expect(() =>
    rescoreCli(["--unknown"], () => {
      throw new Error("must not read");
    }),
  ).toThrow("Usage:");
  expect(() => rescoreCli(["--file="], () => "")).toThrow("Usage:");
  expect(() => rescoreCli(["--file=a", "--file=b"], () => "")).toThrow(
    "Usage:",
  );
});
