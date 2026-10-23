import { expect, test } from "@playwright/test";
test.skip(
  ({ baseURL }) => baseURL !== "http://localhost:3103",
  "Run with e2e/own-question.config.ts for mocked auth/data",
);
const userId = "11111111-1111-4111-8111-111111111111";
const stem =
  "Explain how a rise in interest rates by the Reserve Bank of Australia can affect household consumption and the exchange rate.";
const criteria =
  "1-2: Identifies relevant effects of interest rates.\n3-4: Explains consumption and exchange rate mechanisms.";
test.beforeEach(async ({ context, page }) => {
  const token =
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: userId,
        aud: "authenticated",
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    ]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
      .join(".") + ".c2lnbmF0dXJl";
  const session = {
    access_token: token,
    refresh_token: "fake-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: userId },
  };
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      url: "http://localhost:3103",
    },
  ]);
  await page.route("**/api/attempts/**", (route) => route.abort());
  await page.route("**/api/own-question/autofill", (route) =>
    route.fulfill({
      json: {
        stem,
        marks: 4,
        verb: "explain",
        topic_id: "policy",
        criteria_text: criteria,
      },
    }),
  );
  await page.addInitScript(
    ({ userId }) => {
      localStorage.setItem(
        `claro.single.${userId}`,
        JSON.stringify({
          source: "own",
          selected: "",
          sessionId: null,
          mode: "type",
          own: {
            stem: "Outline inflation.",
            marks: 0,
            verb: "outline",
            topic_id: null,
            criteria_text: null,
          },
          answer: { answer_text: null, transcript: null, image_paths: null },
        }),
      );
    },
    { userId },
  );
});
for (const width of [390, 1280]) {
  test(`restored draft detects verbs and fills once on blur at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    let fills = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/own-question/autofill")) fills++;
    });
    await page.goto("/student/mark");
    const question = page.getByRole("textbox", { name: /Question text/ });
    await expect(question).toHaveValue("Outline inflation.");
    await question.fill(stem);
    await expect(
      page.getByRole("combobox", { name: "Directive verb" }),
    ).toContainText("Explain");
    expect(fills).toBe(0);
    await question.blur();
    await expect(page.getByLabel("Marking guidelines (optional)")).toHaveValue(
      criteria,
    );
    await expect(
      page.getByRole("combobox", { name: "Marks", exact: true }),
    ).toContainText("4 marks");
    await expect(
      page.getByRole("combobox", { name: "Topic (optional)" }),
    ).toContainText("Monetary policy");
    await question.focus();
    await question.blur();
    expect(fills).toBe(1);
    const card = page.getByText("20 of 20 checks left today").locator("..");
    expect(
      await card.evaluate((element) => getComputedStyle(element).position),
    ).toBe("static");
    // Feedback lives in the account menu (topbar avatar / sidebar user row).
    await page
      .getByRole("button", { name: /^(Account|User) menu$/ })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: "Send feedback", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Send feedback" }),
    ).toBeVisible();
  });
}

test("preserves edited guidelines and retries autofill failures", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/own-question/autofill", async (route) => {
    calls++;
    await route.fulfill(
      calls === 1
        ? {
            status: 503,
            json: {
              error: "Couldn't generate marking guidelines. Please try again.",
            },
          }
        : {
            json: {
              stem,
              marks: 4,
              verb: "explain",
              topic_id: "policy",
              criteria_text: criteria,
            },
          },
    );
  });
  await page.goto("/student/mark");
  const question = page.getByRole("textbox", { name: /Question text/ });
  await expect(question).toHaveValue("Outline inflation.");
  await question.fill(stem);
  await page
    .getByLabel("Marking guidelines (optional)")
    .fill("1-4: My own carefully supplied guidelines.");
  await expect(
    page.getByRole("button", { name: "Retry autofill" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry autofill" }).click();
  await expect(
    page.getByRole("combobox", { name: "Marks", exact: true }),
  ).toContainText("4 marks");
  await expect(page.getByLabel("Marking guidelines (optional)")).toHaveValue(
    "1-4: My own carefully supplied guidelines.",
  );
  expect(calls).toBe(2);
});
test("manual verb survives blur and resets for replacement text", async ({
  page,
}) => {
  await page.goto("/student/mark");
  const question = page.getByRole("textbox", { name: /Question text/ });
  await expect(question).toHaveValue("Outline inflation.");
  await question.fill(stem);
  const verb = page.getByRole("combobox", { name: "Directive verb" });
  await verb.click();
  await page.getByRole("option", { name: "Discuss", exact: true }).click();
  await expect(verb).toContainText("Discuss");
  await question.fill("Critically evaluate monetary policy.");
  await expect(verb).toContainText("Critically evaluate");
});
