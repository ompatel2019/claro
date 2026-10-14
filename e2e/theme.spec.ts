import { expect, test, type Page } from "@playwright/test";
import { focusWithKeyboard, signIn, signInAdmin } from "./helpers";

const signInStudent = (page: Page) => signIn(page);
const toggle = (page: Page) =>
  page.getByRole("button", { name: "Dark mode", exact: true });

async function watchFirstPaint(page: Page) {
  await page.addInitScript(() => {
    const observations: boolean[] = [];
    Object.assign(window, { themePaints: observations });
    const observer = new MutationObserver(() => {
      if (document.body) {
        observations.push(document.documentElement.classList.contains("dark"));
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("load", () => observer.disconnect(), {
      once: true,
    });
  });
}
async function expectDarkPaint(page: Page, dark: boolean) {
  await expect(page.locator("html")).toHaveClass(
    dark ? /\bdark\b/ : /^(?!.*\bdark\b)/,
  );
  const paints = await page.evaluate(
    () => (window as typeof window & { themePaints: boolean[] }).themePaints,
  );
  expect(paints.length).toBeGreaterThan(0);
  expect(paints.every((value) => value === dark)).toBe(true);
}

for (const width of [360, 1280]) {
  test.describe(`${width}px theme`, () => {
    test.use({ viewport: { width, height: 900 }, colorScheme: "light" });
    test.beforeEach(async ({ page }) => {
      await watchFirstPaint(page);
    });
    for (const kind of ["student", "admin"] as const) {
      test(`${kind} keyboard toggle, persistence and dark panels`, async ({
        page,
      }) => {
        test.skip(
          kind === "admin"
            ? !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD
            : !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
          `Needs a ${kind} account`,
        );
        const errors: string[] = [];
        page.on("console", (message) => {
          if (
            message.type() === "error" &&
            /hydration|didn't match|did not match/i.test(message.text())
          )
            errors.push(message.text());
        });
        if (kind === "admin") await signInAdmin(page);
        else await signInStudent(page);
        await expectDarkPaint(page, false);
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
        await focusWithKeyboard(page, toggle(page));
        await page.keyboard.press("Enter");
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
        await page.reload();
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
        await expectDarkPaint(page, true);
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("claro-theme")))
          .toBe("dark");
        const paths =
          kind === "student"
            ? [
                ["/student", "student-home"],
                ["/student/sprint", "sprint-setup"],
                ["/student/progress", "progress"],
              ]
            : [
                ["/admin", "admin-dashboard"],
                ["/admin/content/questions", "admin-questions"],
              ];
        for (const [path] of paths) {
          await page.goto(path);
          await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
          await expectDarkPaint(page, true);
          await expect(page.locator("h1")).toBeVisible();
          await expect
            .poll(() => page.locator(".animate-pulse").count())
            .toBe(0);
          const colours = await page
            .locator('[data-slot="card"], header, input')
            .evaluateAll((elements) =>
              elements.map(
                (element) => getComputedStyle(element).backgroundColor,
              ),
            );
          expect(colours).not.toContain("rgb(255, 255, 255)");
          await expect(toggle(page)).toBeInViewport();
        }
        await toggle(page).click();
        await page.reload();
        await expectDarkPaint(page, false);
        await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
        expect(errors).toEqual([]);
      });
    }
    test("system default changes live, override wins and account reset follows system", async ({
      page,
    }) => {
      test.skip(
        !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
        "Needs a student account",
      );
      await page.emulateMedia({ colorScheme: "dark" });
      await signInStudent(page);
      await expectDarkPaint(page, true);
      await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(() => localStorage.getItem("claro-theme")),
      ).toBeNull();
      await page.emulateMedia({ colorScheme: "light" });
      await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
      await toggle(page).click();
      await page.reload();
      await expectDarkPaint(page, true);
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Use system theme" }).click();
      await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expectDarkPaint(page, true);
    });
    test("public sign-in follows system default before paint without storing an override", async ({
      page,
    }) => {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await page.goto("/sign-in");
        await expectDarkPaint(page, colorScheme === "dark");
        expect(
          await page.evaluate(() => localStorage.getItem("claro-theme")),
        ).toBeNull();
      }
    });
    test("invalid and blocked storage fall back to system before paint", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.addInitScript(() =>
        localStorage.setItem("claro-theme", "invalid"),
      );
      await page.goto("/sign-in");
      await expectDarkPaint(page, true);
      await page.addInitScript(() => {
        Object.defineProperty(Storage.prototype, "getItem", {
          value() {
            throw new Error("Storage blocked");
          },
        });
      });
      await page.reload();
      await expectDarkPaint(page, true);
    });
  });
}
