import type { Sorting } from "@/lib/admin";

export function nextSorting(
  current: Sorting | null,
  id: string,
): Sorting | null {
  return current?.id !== id
    ? { id, dir: "asc" }
    : current.dir === "asc"
      ? { id, dir: "desc" }
      : null;
}
