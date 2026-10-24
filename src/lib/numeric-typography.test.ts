import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { expect, it } from "vitest";

// Claro Sans's tabular "1" leaves a wide gap ("1 5", "3 1%"), so the portal
// uses proportional figures everywhere via one inherited body rule. Only
// ticking timers (num-ticking) opt back into equal-width digits.
it("sets proportional figures on body; tabular only for ticking timers", () => {
  const css = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
  const decls: string[] = [];
  css.walkDecls("font-feature-settings", (decl) => {
    const parent = decl.parent as postcss.Rule | postcss.AtRule;
    const where =
      parent.type === "atrule"
        ? `@${parent.name} ${parent.params}`
        : parent.selector;
    decls.push(`${where}: ${decl.value.replace(/\s+/g, " ")}`);
  });
  expect(decls).toEqual([
    'body: "tnum" 0, "pnum" 1',
    '@utility num-ticking: "tnum" 1, "pnum" 0',
  ]);
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

it("keeps num-ticking on the ticking timers only", () => {
  const users = (readdirSync("src", { recursive: true }) as string[]).filter(
    (f) =>
      /\.tsx$/.test(f) &&
      !/\.test\.tsx$/.test(f) &&
      readFileSync(join("src", f), "utf8").includes("num-ticking"),
  );
  expect(users.sort()).toEqual(
    [
      "components/session-shell.tsx",
      join("components", "student", "sprint", "focus-shell.tsx"),
    ].sort(),
  );
});
