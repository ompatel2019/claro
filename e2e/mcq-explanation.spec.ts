import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./fixtures/weak-topic-student";
import { adminClient, cleanupSessions, pick } from "./helpers";

const structured = {
  concept: "A local content rule sets a minimum domestic share.",
  why_correct: "Domestic inputs replace imported inputs.",
  distractors: {
    A: "A tariff taxes imports.",
    B: "A subsidy supports producers.",
    D: "A quota limits import quantities.",
  },
};
for (const width of [390, 1600]) {
  test.describe(`Concept-first MC explanations ${width}px`, () => {
    test.skip(!adminClient(), "Needs Supabase synthetic fixture access");
    for (const choice of [0, 2, null]) {
      test(`structured feedback for choice ${choice}, resume and results`, async ({
        page,
        historyStudent,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const db = adminClient()!;
        const questionId = `s11-${randomUUID()}`;
        const sessions: string[] = [];
        try {
          const { error: questionError } = await db.from("questions").insert({
            id: questionId,
            type: "mcq",
            topic_id: "t3-inflation",
            marks: 1,
            stem: "Synthetic S11: what does a local content rule require?",
            options: [
              "A tariff",
              "A subsidy",
              "Domestic inputs",
              "An import quota",
            ],
            correct_index: 2,
            explanation: JSON.stringify(structured),
            status: "live",
            origin: "claro",
            source: "Synthetic S11",
            year: 2026,
          });
          expect(questionError).toBeNull();
          const { data: session, error: sessionError } = await db
            .from("sessions")
            .insert({
              user_id: historyStudent.userId,
              kind: "sprint",
              config: {
                mode: "mcq",
                feedback: "each",
                topics: ["t3"],
                timed: false,
              },
            })
            .select("id")
            .single();
          expect(sessionError).toBeNull();
          sessions.push(session!.id);
          const { error: attemptError } = await db.from("attempts").insert({
            session_id: session!.id,
            user_id: historyStudent.userId,
            question_id: questionId,
            position: 1,
            status: "pending",
          });
          expect(attemptError).toBeNull();
          await page.goto(`/student/sprint/${session!.id}`);
          await expect(page.getByText(structured.concept)).toHaveCount(0);
          if (choice !== null) {
            await pick(page, "ABCD"[choice]);
            const response = page.waitForResponse(
              (r) =>
                r.url().endsWith("/mark") && r.request().method() === "POST",
            );
            await page.getByRole("button", { name: "Check answer" }).click();
            expect(await (await response).json()).toMatchObject({
              structured_explanation: structured,
            });
            await expect(page.getByText("Thus the answer is C.")).toBeVisible();
            await expect(
              page.getByText(structured.distractors.A),
            ).toBeVisible();
            await page.reload();
            await expect(page.getByText(structured.concept)).toBeVisible();
            await expect(page.getByText("Thus the answer is C.")).toBeVisible();
            await expect(
              page.getByRole("button", { name: "Check answer" }),
            ).toHaveCount(0);
          }
          await page
            .getByRole("banner")
            .getByRole("button", { name: "Finish", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Finish and mark", exact: true })
            .click();
          await expect(page).toHaveURL(/\/student\/activity\/[^/]+$/);
          // Results open the explanation by default for wrong/unanswered choices.
          const conclusion = page.getByText("Thus the answer is C.");
          const details = page.locator("details").filter({ has: conclusion });
          if (choice === 2) {
            await expect(conclusion).toBeHidden();
            await details.locator("summary").click();
          }
          await expect(conclusion).toBeVisible();
          await expect(page.getByText(structured.concept)).toBeVisible();
          await expect(page.getByText(structured.distractors.D)).toBeVisible();
          const order = await details.evaluate(
            (element) => element.textContent ?? "",
          );
          expect(order.indexOf(structured.concept)).toBeLessThan(
            order.indexOf("Thus the answer is C."),
          );
          expect(order.indexOf("Thus the answer is C.")).toBeLessThan(
            order.indexOf(structured.distractors.A),
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: test.info().outputPath(`s11-${choice}.png`),
            fullPage: true,
          });
        } finally {
          await cleanupSessions(sessions);
          const { error } = await db
            .from("questions")
            .delete()
            .eq("id", questionId);
          expect(error).toBeNull();
        }
      });
    }
  });
}
