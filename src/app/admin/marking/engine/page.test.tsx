// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import EnginePage from "./page";

beforeEach(() => vi.clearAllMocks());

const go = (params: Record<string, string>) =>
  EnginePage({ searchParams: Promise.resolve(params) });

it.each([
  [{}, "/admin/marking/accuracy?tab=docs"],
  [{ tab: "docs" }, "/admin/marking/accuracy?tab=docs"],
  [
    { tab: "docs", doc: "AIRO-5-2" },
    "/admin/marking/accuracy?tab=docs&doc=AIRO-5-2",
  ],
  [{ tab: "runs" }, "/admin/marking/accuracy?tab=runs"],
  [
    { tab: "runs", a: "one", b: "two" },
    "/admin/marking/accuracy?tab=runs&a=one&b=two",
  ],
])("redirects old engine URL %o to Marking quality", async (params, url) => {
  await expect(go(params)).rejects.toThrow(`redirect:${url}`);
  expect(mocks.auth).toHaveBeenCalledOnce();
});

it("checks admin access before redirecting", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("forbidden"));
  await expect(go({ tab: "runs" })).rejects.toThrow("forbidden");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
