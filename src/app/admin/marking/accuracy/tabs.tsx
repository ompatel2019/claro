import { LinkTabs } from "@/components/link-tabs";

export type QualityTab = "live" | "runs" | "docs";

export const QUALITY_PATH = "/admin/marking/accuracy";

export function qualityHref(
  tab: QualityTab,
  params: Record<string, string | undefined> = {},
) {
  const query = new URLSearchParams();
  if (tab !== "live") query.set("tab", tab);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) query.set(key, value);
  const search = query.toString();
  return search ? `${QUALITY_PATH}?${search}` : QUALITY_PATH;
}

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Old Engine links (docs, a doc page, runs, a comparison) land on the
 * matching Marking quality tab. */
export function engineRedirect(params: Params) {
  const a = one(params.a),
    b = one(params.b);
  if (one(params.tab) === "runs" || a !== undefined || b !== undefined)
    return qualityHref("runs", { a, b });
  return qualityHref("docs", { doc: one(params.doc) });
}

export function QualityTabs({ tab }: { tab: QualityTab }) {
  return (
    <LinkTabs
      label="Marking quality"
      active={tab}
      tabs={[
        { value: "live", label: "Live checks", href: qualityHref("live") },
        { value: "runs", label: "Eval runs", href: qualityHref("runs") },
        {
          value: "docs",
          label: "How marking works",
          href: qualityHref("docs"),
        },
      ]}
    />
  );
}
