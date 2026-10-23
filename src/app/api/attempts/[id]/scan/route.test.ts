// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  attempt: vi.fn(),
  rpc: vi.fn(),
  adminFrom: vi.fn(),
  rate: vi.fn(),
  transcribe: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({
      select() {
        return this;
      },
      eq(column: string, value: string) {
        mocks.eq(column, value);
        return this;
      },
      maybeSingle: mocks.attempt,
    }),
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ rpc: mocks.rpc, from: mocks.adminFrom }),
}));
vi.mock("@/lib/ai/usage-context", () => ({
  withAttemptUsage: (_id: string, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/marking/engine", () => ({ transcribeImage: mocks.transcribe }));
vi.mock("@/lib/ai/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/ai/rate-limit")>()),
  assertStudentAiRateLimit: mocks.rate,
  withAiUsageReservation: (_r: unknown, fn: () => unknown) => fn(),
}));
import { BUDGET_USD } from "@/lib/ai/prices";
import { SCAN_PHOTO_BYTE_LIMIT, WRITTEN_WORD_LIMIT } from "@/lib/limits";
import { POST } from "./route";

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const image = (bytes = JPEG, type = "image/jpeg", size = bytes.length) => {
  const data = new Uint8Array(size);
  data.set(bytes.slice(0, size));
  return new File([data], "scan", { type });
};
const form = (...files: File[]) => {
  const body = new FormData();
  for (const file of files) body.append("file", file);
  return body;
};
const send = (body: BodyInit | null = form(image()), id = ID) =>
  POST(new Request("https://example.test", { method: "POST", body }), {
    params: Promise.resolve({ id }),
  });
const row = (patch: Record<string, unknown> = {}) => ({
  status: "pending",
  image_paths: null,
  question: { type: "short", stem: "Explain one effect of a tariff." },
  session: { kind: "sprint", config: { feedback: "end" }, finished_at: null },
  ...patch,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "u" } } });
  mocks.attempt.mockResolvedValue({ data: row() });
  mocks.rate.mockResolvedValue({ ok: true, reservationId: "r" });
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.transcribe.mockResolvedValue({
    transcript: "Prices rise[?]\nImports [?] fall",
    lines: ["Prices rise[?]", "Imports [?] fall"],
    notes: "Supply and demand diagram",
  });
});

it("returns typed text from the photo without writing to the attempt", async () => {
  const response = await send();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    text: "Prices rise[?]\nImports [?] fall",
    uncertain: 2,
    notes: "Supply and demand diagram",
  });
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "u");
  expect(mocks.eq).toHaveBeenCalledWith("id", ID);
  expect(mocks.rate).toHaveBeenCalledWith({ userId: "u" });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("ai_spend");
  const [bytes, mime, stem, user, opts] = mocks.transcribe.mock.calls[0];
  expect([...new Uint8Array(bytes)]).toEqual(JPEG);
  expect([mime, stem, user, opts]).toEqual([
    "image/jpeg",
    "Explain one effect of a tariff.",
    "u",
    { task: "transcribe_answer:scan", detail: "high" },
  ]);
  expect(mocks.adminFrom).not.toHaveBeenCalled();
});

it.each([
  ["png", PNG, "image/png"],
  ["webp", WEBP, "image/webp"],
])("accepts %s photos", async (_name, bytes, type) => {
  expect((await send(form(image(bytes, type)))).status).toBe(200);
});

it("allows each-feedback answers that are still pending", async () => {
  mocks.attempt.mockResolvedValue({
    data: row({ session: { kind: "sprint", config: { feedback: "each" } } }),
  });
  expect((await send()).status).toBe(200);
});

it("caps the scanned text at the written word limit", async () => {
  const words = Array.from({ length: WRITTEN_WORD_LIMIT + 5 }, () => "word");
  mocks.transcribe.mockResolvedValue({
    transcript: words.join(" "),
    lines: [words.join(" ")],
    notes: "",
  });
  const { text } = await (await send()).json();
  expect(text.split(" ")).toHaveLength(WRITTEN_WORD_LIMIT);
});

const guards: [string, () => void, number, (() => BodyInit)?][] = [
  [
    "signed out",
    () => mocks.user.mockResolvedValue({ data: { user: null } }),
    401,
  ],
  [
    "another student's attempt",
    () => mocks.attempt.mockResolvedValue({ data: null }),
    404,
  ],
  [
    "an mcq question",
    () =>
      mocks.attempt.mockResolvedValue({
        data: row({ question: { type: "mcq", stem: "Pick one" } }),
      }),
    404,
  ],
  [
    "a single check",
    () =>
      mocks.attempt.mockResolvedValue({
        data: row({ session: { kind: "single", config: {} } }),
      }),
    404,
  ],
  [
    "a finished sprint",
    () =>
      mocks.attempt.mockResolvedValue({
        data: row({
          session: { kind: "sprint", config: {}, finished_at: "2026-10-23" },
        }),
      }),
    409,
  ],
  [
    "a marked each-feedback answer",
    () =>
      mocks.attempt.mockResolvedValue({
        data: row({
          status: "marked",
          session: { kind: "sprint", config: { feedback: "each" } },
        }),
      }),
    409,
  ],
  [
    "a photo answer",
    () =>
      mocks.attempt.mockResolvedValue({
        data: row({ image_paths: ["u/a-1-0.jpg"] }),
      }),
    409,
  ],
  ["no file", () => {}, 400, () => new FormData()],
  ["two files", () => {}, 400, () => form(image(), image())],
  [
    "a non-file field",
    () => {},
    400,
    () => {
      const body = new FormData();
      body.append("file", "text");
      return body;
    },
  ],
  ["an empty file", () => {}, 400, () => form(image(JPEG, "image/jpeg", 0))],
  ["a GIF", () => {}, 400, () => form(image([0x47, 0x49, 0x46], "image/gif"))],
  ["a HEIC upload", () => {}, 400, () => form(image(JPEG, "image/heic"))],
  [
    "mismatched magic bytes",
    () => {},
    400,
    () => form(image(PNG, "image/jpeg")),
  ],
  [
    "a photo over 4 MB",
    () => {},
    413,
    () => form(image(JPEG, "image/jpeg", SCAN_PHOTO_BYTE_LIMIT + 1)),
  ],
  [
    "the shared rate limit",
    () =>
      mocks.rate.mockResolvedValue({
        ok: false,
        error: "Slow down",
        retryAfterSec: 60,
      }),
    429,
  ],
  [
    "spend at the budget",
    () => mocks.rpc.mockResolvedValue({ data: BUDGET_USD, error: null }),
    503,
  ],
  [
    "an unknown spend",
    () => mocks.rpc.mockResolvedValue({ data: null, error: new Error("db") }),
    503,
  ],
];

it.each(guards)(
  "refuses %s before any paid call",
  async (_name, setup, status, body) => {
    setup();
    const response = await send(body?.());
    expect(response.status).toBe(status);
    expect((await response.json()).error).toEqual(expect.any(String));
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    if (status < 429) expect(mocks.rate).not.toHaveBeenCalled();
    if (status === 429) expect(response.headers.get("Retry-After")).toBe("60");
  },
);

it("refuses a malformed attempt id without a database read", async () => {
  expect((await send(form(image()), "not-a-uuid")).status).toBe(404);
  expect(mocks.attempt).not.toHaveBeenCalled();
});

it("rejects a declared oversized body before reading it", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: form(image()),
    headers: { "content-length": String(SCAN_PHOTO_BYTE_LIMIT * 2) },
  });
  const formData = vi.spyOn(request, "formData");
  const response = await POST(request, { params: Promise.resolve({ id: ID }) });
  expect(response.status).toBe(413);
  expect(formData).not.toHaveBeenCalled();
});

it("maps the engine budget stop to 503 and other failures to 500", async () => {
  mocks.transcribe.mockRejectedValueOnce(new Error("AI budget reached"));
  expect((await send()).status).toBe(503);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.transcribe.mockRejectedValueOnce(new Error("timeout"));
  const response = await send();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Couldn't read your photo. Try again.",
  });
});

it("reports an unreadable photo", async () => {
  mocks.transcribe.mockResolvedValue({ transcript: "", lines: [], notes: "" });
  const response = await send();
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ unreadable: true });
});
