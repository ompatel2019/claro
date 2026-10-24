import { readFileSync } from "node:fs";
import postcss from "postcss";
import { expect, it } from "vitest";

const css = postcss.parse(readFileSync("src/app/globals.css", "utf8"));

// Claro Sans's tabular "1" leaves a wide gap ("1 5", "3 1%"), so the portal
// uses proportional figures everywhere.
it("sets proportional figures on body and never re-enables tabular figures", () => {
  const body: string[] = [];
  const tnumOn: string[] = [];
  css.walkDecls("font-feature-settings", (decl) => {
    const value = decl.value.replace(/\s+/g, " ");
    if ((decl.parent as postcss.Rule).selector === "body") body.push(value);
    if (/"tnum"(?! 0)/.test(value)) tnumOn.push(value);
  });
  expect(body).toEqual(['"tnum" 0, "pnum" 1']);
  expect(tnumOn).toEqual([]);
});
