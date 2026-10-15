// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/single-check-autofill", async (original) => ({
  ...(await original<typeof import("@/lib/single-check-autofill")>()),
  generateOwnQuestion: vi.fn(),
}));
vi.mock("@/lib/ai/openai", () => ({ callJson: vi.fn() }));
import { createClient } from "@/utils/supabase/server";
import {
  generateOwnQuestion,
  AutofillRateLimit,
} from "@/lib/single-check-autofill";
import { POST } from "./route";
const request = (body: unknown = { stem: "Explain monetary policy." }) =>
  new Request("http://localhost/api/own-question/autofill", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "true");
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
  } as never);
});
afterEach(() => vi.unstubAllEnvs());
it("requires authentication", async () => {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: null } }) },
  } as never);
  expect((await POST(request())).status).toBe(401);
  expect(generateOwnQuestion).not.toHaveBeenCalled();
});
it.each(["ENABLE_OWN_QUESTION_MARKING", "ENABLE_OWN_QUESTION_AUTOFILL"])(
  "requires %s",
  async (flag) => {
    vi.stubEnv(flag, "false");
    expect((await POST(request())).status).toBe(403);
    expect(generateOwnQuestion).not.toHaveBeenCalled();
  },
);
it.each([
  { stem: "short" },
  { stem: "Explain monetary policy.", marks: 21 },
  null,
])("rejects invalid input %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(generateOwnQuestion).not.toHaveBeenCalled();
});
it("returns suggestions only for the authenticated student", async () => {
  vi.mocked(generateOwnQuestion).mockResolvedValue({
    stem: "Explain monetary policy.",
    marks: 4,
    verb: "explain",
    topic_id: "policy",
    criteria_text: "1-4: Explains relevant monetary policy mechanisms.",
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(generateOwnQuestion).toHaveBeenCalledWith("u", {
    stem: "Explain monetary policy.",
  });
});
it("returns retryable generation errors", async () => {
  vi.mocked(generateOwnQuestion).mockRejectedValue(
    new Error("Please retry guidelines"),
  );
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Please retry guidelines" });
});

it("returns the existing rate-limit response and retry header", async () => {
  vi.mocked(generateOwnQuestion).mockRejectedValue(
    new AutofillRateLimit("Slow down", 60),
  );
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
});
