import { cardSchema } from "./card-import";
import { CARD_IMPORT_BYTE_LIMIT, CARD_IMPORT_ROW_LIMIT } from "./limits";

export type CardTextSource = "quizlet" | "anki";
type TextCard = { line: number; front: string; back: string };
type LineError = { line: number; message: string };
const sides = cardSchema.pick({ front: true, back: true });

function stripHtml(value: string) {
  const entities: Record<string, string> = {
    nbsp: " ",
    lt: "<",
    gt: ">",
    quot: '"',
    "#39": "'",
    apos: "'",
  };
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\b[^>]*>|<\/(?:div|p|li)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\[sound:[^\]]*\]/gi, "")
    .replace(
      /&(nbsp|lt|gt|quot|#39|apos|#\d+|#x[\da-f]+);/gi,
      (entity, key: string) => {
        key = key.toLowerCase();
        if (key in entities) return entities[key];
        const code = key.startsWith("#x")
          ? parseInt(key.slice(2), 16)
          : Number(key.slice(1));
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : entity;
      },
    )
    .replace(/&amp;/gi, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseCardText(text: string, source: CardTextSource) {
  if (new TextEncoder().encode(text).length > CARD_IMPORT_BYTE_LIMIT)
    throw new Error("Files must be 1 MB or smaller.");
  text = text.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");
  const cards: TextCard[] = [];
  const errors: LineError[] = [];
  let unclosed = false;
  const excluded = new Set<number>();
  let html = source === "anki";
  let headers = true;
  let line = 1;
  let rows = 0;
  let i = 0;
  while (i < text.length) {
    const startLine = line;
    const end = text.indexOf("\n", i);
    const physical = text.slice(i, end < 0 ? text.length : end);
    if (!physical.trim() || (source === "anki" && physical.startsWith("#"))) {
      if (source === "anki" && headers) {
        const header = /^#([^:]+):(.*)$/.exec(physical);
        if (header) {
          const key = header[1].toLowerCase();
          const value = header[2].trim().toLowerCase();
          if (
            key === "separator" &&
            header[2] !== "\t" &&
            !["tab", "\\t"].includes(value)
          )
            throw new Error("Export with tabs between fields.");
          if (key === "html") html = value !== "false";
          if (
            /^(guid|notetype|deck|tags) column$/.test(key) &&
            /^\d+$/.test(value)
          )
            excluded.add(Number(value) - 1);
        }
      }
      i = end < 0 ? text.length : end + 1;
      line++;
      continue;
    }
    headers = false;
    const fields: string[] = [];
    while (true) {
      let field = "";
      if (source === "anki" && !unclosed && text[i] === '"') {
        let cursor = i + 1;
        while (cursor < text.length) {
          if (text[cursor] !== '"') {
            cursor++;
            continue;
          }
          if (text[cursor + 1] === '"') {
            cursor += 2;
            continue;
          }
          if (cursor + 1 === text.length || /[\t\n]/.test(text[cursor + 1]))
            break;
          cursor++;
        }
        // Once a quote never closes, later quotes can't either: read them
        // literally rather than rescanning the rest of the paste each time.
        if (cursor >= text.length) unclosed = true;
        else {
          field = text.slice(i + 1, cursor).replace(/""/g, '"');
          line += (field.match(/\n/g) ?? []).length;
          i = cursor + 1;
        }
      }
      if (!field && text[i] !== "\t" && text[i] !== "\n" && i < text.length) {
        const start = i;
        while (i < text.length && text[i] !== "\t" && text[i] !== "\n") i++;
        field = text.slice(start, i);
      }
      fields.push(field);
      if (text[i] !== "\t") break;
      i++;
    }
    if (text[i] === "\n") {
      i++;
      line++;
    }
    if (++rows > CARD_IMPORT_ROW_LIMIT)
      throw new Error("Import at most 500 cards.");
    const regular = fields.filter((_, column) => !excluded.has(column));
    if (regular.length < 2) {
      errors.push({
        line: startLine,
        message: "No tab between front and back",
      });
      continue;
    }
    const clean = (value = "") => (html ? stripHtml(value) : value.trim());
    const result = sides.safeParse({
      front: clean(regular[0]).replace(/\n+/g, " "),
      back: clean(regular[1]),
    });
    if (result.success) cards.push({ line: startLine, ...result.data });
    else
      errors.push({ line: startLine, message: result.error.issues[0].message });
  }
  if (!rows) throw new Error("No cards found.");
  return { cards, errors };
}
