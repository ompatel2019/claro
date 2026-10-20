// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { signInAdminRedirect } from "./helpers";
import { GUARD_FLAG } from "./guard";

const visible = vi.hoisted(() => vi.fn());
vi.mock("@playwright/test", () => ({
  expect: () => ({ toBeVisible: visible }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function fakePage() {
  return {
    goto: vi.fn(),
    getByLabel: vi.fn(() => ({ fill: vi.fn() })),
    getByRole: vi.fn(() => ({ click: vi.fn() })),
    waitForURL: vi.fn(),
  };
}

it("refuses the shared redirect login before navigating when D6 has not passed", async () => {
  vi.stubEnv(GUARD_FLAG, "");
  const page = fakePage();
  await expect(signInAdminRedirect(page as unknown as Page)).rejects.toThrow(
    "production-target guard in globalSetup did not pass",
  );
  expect(page.goto).not.toHaveBeenCalled();
  expect(page.getByLabel).not.toHaveBeenCalled();
});

it.each([true, false])(
  "preserves redirect login waits (waitForEmail=%s)",
  async (waitForEmail) => {
    vi.stubEnv(GUARD_FLAG, "1");
    const page = fakePage();
    await signInAdminRedirect(page as unknown as Page, waitForEmail);
    expect(page.goto).toHaveBeenCalledWith("/sign-in");
    expect(page.getByRole).toHaveBeenCalledWith("button", {
      name: "Sign in",
      exact: true,
    });
    expect(page.waitForURL).toHaveBeenCalledWith(
      /\/(admin)?$/,
      waitForEmail ? { timeout: 30000 } : undefined,
    );
    if (waitForEmail) expect(visible).toHaveBeenCalledWith({ timeout: 60000 });
    else expect(visible).not.toHaveBeenCalled();
  },
);
