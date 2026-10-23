/**
 * Display-only tidy of arithmetic in sample answers: "840/105 x 100/1 = $800 m" -> "840 ÷ 105 × 100 = $800m".
 * Only rewrites a run of plain numbers joined by operators that ends in "= <number>"; prose, dates and URLs are untouched.
 */
const NUM = String.raw`\$?\d[\d,]*(?:\.\d+)?%?`;
const OP = String.raw`(?:\s*[/*×÷+]\s*|\s+[xX-]\s+|(?<=\d)[xX](?=\d))`;
const EXPR = new RegExp(
  String.raw`(?<![\w/:.$-])(${NUM}(?:${OP}${NUM})+)(\s*=\s*)(${NUM})([ \t]?(?:m|bn|b|k)(?!\w))?`,
  "g",
);

function tidy(expr: string) {
  const ops = expr.match(/[/*×÷+]|\s[xX-]\s|(?<=\d)[xX](?=\d)/g) ?? [];
  // Two or more bare slashes reads like a date (1/2/2026), not a sum.
  if (ops.length > 1 && ops.every((o) => o === "/")) return null;
  return expr
    .replace(/\s*\/\s*1(?![\d.,%])/g, "")
    .replace(/\s*\/\s*/g, " ÷ ")
    .replace(/\s*\*\s*|\s+[xX]\s+|(?<=\d)[xX](?=\d)/g, " × ")
    .replace(/\s*÷\s*/g, " ÷ ")
    .replace(/\s*×\s*/g, " × ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+-\s+/g, " − ");
}

// Absolute, www., bare-domain ("example.com/...") and relative URL spans are left alone.
const URL_SPAN =
  /(\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*|(?<![^\s([{"'])\/(?=[a-z_~.])\S+)/i;

export function formatSampleMaths(text: string) {
  // Odd indexes are URL spans, which are never rewritten.
  return text
    .split(URL_SPAN)
    .map((part, i) => (i % 2 ? part : formatPart(part)))
    .join("");
}

function formatPart(text: string) {
  return text.replace(
    EXPR,
    (all, expr: string, _eq, result: string, unit?: string) => {
      const out = tidy(expr);
      return out == null ? all : `${out} = ${result}${unit ? unit.trim() : ""}`;
    },
  );
}
