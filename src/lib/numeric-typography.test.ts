import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, it } from "vitest";

// Claro Sans's tabular "1" leaves a wide gap ("1 5", "3 1%"), so the portal
// uses proportional figures everywhere via one inherited body rule.
it("sets proportional figures once, on body", () => {
  const css = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
  const decls: string[] = [];
  css.walkDecls("font-feature-settings", (decl) => {
    const rule = decl.parent as postcss.Rule;
    decls.push(`${rule.selector}: ${decl.value.replace(/\s+/g, " ")}`);
  });
  expect(decls).toEqual(['body: "tnum" 0, "pnum" 1']);
});

it("never overrides font features elsewhere in source", () => {
  const files = (readdirSync("src", { recursive: true }) as string[]).filter(
    (f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f),
  );
  const offenders = files.filter(
    (f) =>
      f !== join("app", "globals.css") &&
      /font-feature-settings|fontFeatureSettings/.test(
        readFileSync(join("src", f), "utf8"),
      ),
  );
  expect(offenders).toEqual([]);
});
