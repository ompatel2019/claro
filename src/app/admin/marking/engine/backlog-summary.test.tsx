import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BacklogSummary } from "./backlog-summary";
import type { OfflineEvalRun } from "./summary";

afterEach(cleanup);
const run = (stamp = "2026-10-09-1415"): OfflineEvalRun => ({
  meta: { stamp, label: "Full backlog", marker: { model: "marker" } },
  items: [
    {
      section: "Held-out",
      marks: 6,
      expected: 3,
      mark: 3,
      score: { band: true },
    },
    {
      section: "Held-out",
      marks: 6,
      expected: 3,
      mark: 4,
      score: { band: true },
    },
    {
      section: "Held-out",
      marks: 6,
      expected: 3,
      mark: 5,
      score: { band: true },
    },
    {
      section: "Held-out",
      marks: 5,
      expected: 3,
      mark: 4,
      score: { band: false },
    },
    { section: "Held-out", marks: 5, expected: 3, mark: 4, error: "Failed" },
    {
      section: "Held-out",
      marks: 5,
      expected: 3,
      mark: 3,
      flags: { excluded: "Bad fixture" },
    },
    { section: "A1", marks: 5, expected: 3, mark: 3 },
    { section: "Claro", marks: 5, expected: [2, 4], mark: 3 },
  ],
});

it("shows human agreement independently of blind checks, failures and other sets", () => {
  render(<BacklogSummary runs={[run()]} />);
  const card = screen.getByLabelText("A1 mock backlog calibration");
  expect(
    within(card).getByText("Scored scripts").nextElementSibling,
  ).toHaveTextContent("4");
  expect(
    within(card).getByText("Exact human mark").nextElementSibling,
  ).toHaveTextContent("25.0%");
  expect(
    within(card).getByText("Human-mark agreement").nextElementSibling,
  ).toHaveTextContent("50.0%");
  expect(card).toHaveTextContent("within one mark");
  expect(card).toHaveTextContent("student disputes do not affect");
});

it("uses the newest full backlog run, skipping newer benchmark and partial runs", () => {
  const partial = run("2026-10-09-1440");
  partial.meta.items = [0];
  const limited = run("2026-10-09-1439");
  limited.meta.limit = 1;
  const benchmark = run("2026-10-09-1441");
  benchmark.items = benchmark.items.filter((i) => i.section === "A1");
  const older = run("2026-10-09-1211");
  older.meta.label = "Older backlog";
  render(<BacklogSummary runs={[older, benchmark, partial, limited, run()]} />);
  expect(screen.getByText(/Latest full backlog run/)).toHaveTextContent(
    "14:15 · marker · Full backlog",
  );
  expect(screen.queryByText(/Older backlog/)).not.toBeInTheDocument();
});

it.each([
  { runs: [] },
  { runs: [{ ...run(), items: [] }] },
  {
    runs: [
      {
        ...run(),
        items: [{ section: "Held-out", marks: 6, expected: 3, mark: null }],
      },
    ],
  },
])("shows an honest empty state for %j", ({ runs }) => {
  render(<BacklogSummary runs={runs} />);
  expect(
    screen.getByText(/No full held-out backlog evaluation yet/),
  ).toBeVisible();
  expect(screen.queryByText("Human-mark agreement")).not.toBeInTheDocument();
});

it("never renders script answers, identifiers or feedback", () => {
  const data = run();
  data.items[0] = {
    ...data.items[0],
    answer: "PRIVATE SCRIPT",
    id: "PRIVATE ID",
    feedback: "PRIVATE FEEDBACK",
  } as (typeof data.items)[0];
  render(<BacklogSummary runs={[data]} />);
  expect(
    screen.getByLabelText("A1 mock backlog calibration"),
  ).not.toHaveTextContent(/PRIVATE/);
});

it.each([
  { blocked: true },
  { status: "running" },
  { status: "cancelled" },
  { status: "interrupted" },
  { status: "failed" },
])("skips incomplete backlog runs with %j", (meta) => {
  const interrupted = run("2026-10-09-1500");
  Object.assign(interrupted.meta, meta, { label: "Incomplete backlog" });
  render(<BacklogSummary runs={[interrupted, run()]} />);
  expect(screen.getByText(/Latest full backlog run/)).toHaveTextContent(
    "Full backlog",
  );
  expect(screen.queryByText(/Incomplete backlog/)).not.toBeInTheDocument();
});
