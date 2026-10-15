export const OPENROUTER_MODEL_PREFIX = "anthropic/";

export function isOpenRouterModel(model: string): boolean {
  return (
    model.startsWith(OPENROUTER_MODEL_PREFIX) || model.startsWith("openai/")
  );
}

type SpendDb = {
  from(table: "ai_usage"): {
    select(columns: "usd"): {
      like(
        column: "model",
        pattern: string,
      ): {
        order(column: "id"): {
          range(
            from: number,
            to: number,
          ): PromiseLike<{
            data: { usd: unknown }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export async function openRouterSpend(db: SpendDb): Promise<number> {
  let total = 0;
  for (const prefix of [OPENROUTER_MODEL_PREFIX, "openai/"]) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("ai_usage")
        .select("usd")
        .like("model", `${prefix}%`)
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(`ai_spend failed: ${error.message}`);
      if (data == null) throw new Error("Invalid ai_spend result");
      for (const row of data) {
        const usd = Number(row.usd);
        if (!Number.isFinite(usd)) throw new Error("Invalid ai_spend result");
        total += usd;
      }
      if (!Number.isFinite(total)) throw new Error("Invalid ai_spend result");
      if (data.length < 1000) break;
    }
  }
  return total;
}
