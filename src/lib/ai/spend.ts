export const OPENROUTER_MODEL_PREFIX = "anthropic/";

export function isOpenRouterModel(model: string): boolean {
  return (
    model.startsWith(OPENROUTER_MODEL_PREFIX) || model.startsWith("openai/")
  );
}

type SpendDb = {
  rpc(
    fn: "ai_spend_for_prefixes",
    args: { p_prefixes: string[] },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Total logged spend on OpenRouter models, summed in SQL (service role only). */
export async function openRouterSpend(db: SpendDb): Promise<number> {
  const { data, error } = await db.rpc("ai_spend_for_prefixes", {
    p_prefixes: [OPENROUTER_MODEL_PREFIX, "openai/"],
  });
  if (error) throw new Error(`ai_spend failed: ${error.message}`);
  if (data == null) throw new Error("Invalid ai_spend result");
  const total = Number(data);
  if (!Number.isFinite(total)) throw new Error("Invalid ai_spend result");
  return total;
}
