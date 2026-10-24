/** One entry per saved answer version. Failures wait for the server's Finish retry. */
export function createSprintMarkQueue(
  mark: (id: string) => Promise<void>,
  /** Called whenever an answer's mark settles, so a view can re-read `marked()`. */
  onSettled?: () => void,
) {
  type Entry = {
    version: string;
    state: "queued" | "running" | "marked" | "failed";
  };
  const entries = new Map<string, Entry>();
  const active = new Map<string, Promise<void>>();
  let stopped = false;

  function pump() {
    if (stopped) return;
    for (const [id, entry] of entries) {
      if (active.size >= 2) break;
      if (entry.state !== "queued" || active.has(id)) continue;
      entry.state = "running";
      const task = Promise.resolve()
        .then(() => mark(id))
        .then(
          () => {
            entry.state = "marked";
          },
          () => {
            entry.state = "failed";
          },
        )
        .finally(() => {
          active.delete(id);
          onSettled?.();
          pump();
        });
      active.set(id, task);
    }
  }

  return {
    enqueue(id: string, version: string) {
      if (stopped || entries.get(id)?.version === version) return;
      entries.set(id, { version, state: "queued" });
      pump();
    },
    /** Stop dispatching; Finish owns queued/failed answers after running calls settle. */
    async finish() {
      stopped = true;
      await Promise.all(active.values());
      return [...entries]
        .filter(([, entry]) => entry.state !== "marked")
        .map(([id]) => id);
    },
    /** Marked answers, by the version that was marked. */
    marked() {
      return new Map(
        [...entries]
          .filter(([, entry]) => entry.state === "marked")
          .map(([id, entry]) => [id, entry.version]),
      );
    },
    resume() {
      stopped = false;
      pump();
    },
  };
}
