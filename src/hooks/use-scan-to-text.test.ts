import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SCAN_PHOTO_BYTE_LIMIT } from "@/lib/limits";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ ensureSession: session }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
import { SCAN_ERRORS, prepareScan, useScanToText } from "./use-scan-to-text";

let drawn: number[] = [];
let encoded = 1000;
const fetchMock = vi.fn();
const photo = (type = "image/jpeg", name = "answer.jpg") =>
  new File(["x"], name, { type });
const reply = (status: number, body: object, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  drawn = [];
  encoded = 1000;
  session.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 4032, height: 3024, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) =>
      drawn.push(w, h),
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (done, type) => done(new Blob([new Uint8Array(encoded)], { type })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shrinks to a 2048 px long edge as JPEG", async () => {
  const blob = await prepareScan(photo());
  expect(drawn).toEqual([2048, 1536]);
  expect(blob.type).toBe("image/jpeg");
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
    expect.any(Function),
    "image/jpeg",
    0.85,
  );
});

it("converts HEIC and rejects other types or oversized results", async () => {
  await expect(prepareScan(photo("", "IMG_1.HEIC"))).resolves.toBeInstanceOf(
    Blob,
  );
  await expect(prepareScan(photo("image/gif", "a.gif"))).rejects.toThrow(
    SCAN_ERRORS.type,
  );
  vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("decode"));
  await expect(prepareScan(photo("image/heic", "a.heic"))).rejects.toThrow(
    SCAN_ERRORS.heic,
  );
  encoded = SCAN_PHOTO_BYTE_LIMIT + 1;
  await expect(prepareScan(photo())).rejects.toThrow(SCAN_ERRORS.large);
});

it("posts one prepared photo and returns the text", async () => {
  fetchMock.mockResolvedValue(
    reply(200, { text: "Prices rise[?]", uncertain: 1, notes: "" }),
  );
  const { result } = renderHook(() => useScanToText("a1"));
  let scanned;
  await act(async () => {
    scanned = await result.current.scan(photo());
  });
  expect(scanned).toEqual({ text: "Prices rise[?]", uncertain: 1, notes: "" });
  expect(result.current.state).toBe("done");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/attempts/a1/scan");
  expect(init.method).toBe("POST");
  const file = (init.body as FormData).getAll("file");
  expect(file).toHaveLength(1);
  expect((file[0] as File).type).toBe("image/jpeg");
});

it.each([
  [404, SCAN_ERRORS.notFound],
  [409, SCAN_ERRORS.locked],
  [413, SCAN_ERRORS.large],
  [422, SCAN_ERRORS.unreadable],
  [503, SCAN_ERRORS.paused],
  [500, SCAN_ERRORS.failed],
])("maps %i to a clear message", async (status, message) => {
  fetchMock.mockResolvedValue(reply(status, { error: "server copy" }));
  const { result } = renderHook(() => useScanToText("a1"));
  await act(() => result.current.scan(photo()));
  expect(result.current).toMatchObject({ state: "error", error: message });
});

it("refreshes the session once on 401", async () => {
  fetchMock
    .mockResolvedValueOnce(reply(401, {}))
    .mockResolvedValueOnce(reply(200, { text: "ok", uncertain: 0 }));
  const { result } = renderHook(() => useScanToText("a1"));
  await act(() => result.current.scan(photo()));
  expect(session).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe("done");

  session.mockRejectedValueOnce(new Error("expired"));
  fetchMock.mockResolvedValueOnce(reply(401, {}));
  await act(() => result.current.scan(photo()));
  expect(result.current.error).toBe(SCAN_ERRORS.signIn);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("holds off until Retry-After when rate limited", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  fetchMock.mockResolvedValue(
    reply(429, { error: "Slow down" }, { "Retry-After": "60" }),
  );
  const { result } = renderHook(() => useScanToText("a1"));
  await act(() => result.current.scan(photo()));
  expect(result.current).toMatchObject({
    error: "Slow down",
    retryAt: 1_060_000,
  });
  vi.mocked(Date.now).mockRestore();
});

it("aborts the request on unmount without reporting an error", async () => {
  let signal: AbortSignal | undefined;
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init.signal;
        signal!.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  const { result, unmount } = renderHook(() => useScanToText("a1"));
  let pending: Promise<unknown> | undefined;
  await act(async () => {
    pending = result.current.scan(photo());
    await vi.waitFor(() => expect(signal).toBeDefined());
  });
  unmount();
  expect(signal!.aborted).toBe(true);
  await expect(pending).resolves.toBeNull();
});
