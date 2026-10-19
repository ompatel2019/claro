// @vitest-environment node
import { expect, it } from "vitest";
import { parseArgs } from "./args";

it("keeps the default flags", () => {
  expect(parseArgs([])).toEqual({
    dry: false,
    limit: Infinity,
    label: "",
    selectedItems: null,
    set: undefined,
  });
  expect(parseArgs(["--items=0,2", "--label=fixture"])).toMatchObject({
    selectedItems: [0, 2],
    label: "fixture",
  });
});

it.each(["dev", "final"])("combines %s with limit and dry-run", (set) => {
  expect(parseArgs([`--set=${set}`, "--limit=5", "--dry-run"])).toMatchObject({
    set,
    limit: 5,
    dry: true,
  });
  expect(parseArgs([`--set=${set}`, "--items=0"])).toMatchObject({
    set,
    selectedItems: [0],
  });
});

it.each([
  ["--set="],
  ["--set=test"],
  ["--set=dev", "--set=final"],
  ["--unknown"],
  ["--limit=0"],
  ["--limit=9007199254740992"],
  ["--items=-1"],
  ["--items=1.5"],
  ["--items=0,"],
  ["--items=9007199254740992"],
  ["--limit=1", "--items=0"],
])("rejects invalid arguments %j", (...args) => {
  expect(() => parseArgs(args)).toThrow("Use --dry-run");
});
