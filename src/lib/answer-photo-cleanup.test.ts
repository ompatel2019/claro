import { afterEach, expect, it, vi } from "vitest";
import { cleanupAnswerPhotos } from "./answer-photo-cleanup";

const remove = vi.hoisted(() => vi.fn());
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ remove }) } }),
}));
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
}));
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
const path = "u/11111111-1111-4111-8111-111111111111-1729000000000-0.png";

it("persists failed object deletes and retries them without another upload", async () => {
  remove.mockResolvedValueOnce({ error: { message: "Offline" } });
  await expect(cleanupAnswerPhotos("u", [path])).resolves.toBeUndefined();
  expect(JSON.parse(localStorage.getItem("claro-photo-cleanup-u")!)).toEqual([
    path,
  ]);
  remove.mockResolvedValueOnce({ error: null });
  await cleanupAnswerPhotos("u");
  expect(remove).toHaveBeenLastCalledWith([path]);
  expect(localStorage.getItem("claro-photo-cleanup-u")).toBeNull();
});

it("never removes another student's objects or unsafe keys", async () => {
  await cleanupAnswerPhotos("u", [
    path.replace("u/", "other/"),
    "u/../photo.png",
  ]);
  expect(remove).not.toHaveBeenCalled();
});
