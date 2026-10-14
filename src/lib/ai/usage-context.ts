import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
const usage = new AsyncLocalStorage<string>();
/** Preserve attribution through concurrent marking passes without changing the engine. */
export function withAttemptUsage<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  return usage.run(id, work);
}
export function usageAttemptId() {
  return usage.getStore() ?? null;
}
