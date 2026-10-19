/** Read every row of a ranged query, page by page (Data API responses are capped). */
export async function pages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await query(from, from + pageSize - 1);
    if (result.error) throw result.error;
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}
