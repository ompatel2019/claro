const listItem =
  /^\s*(?:[•*\-]\s+|\((?:[a-z]|[ivxlcdm]+|\d+)\)\s*|(?:[a-z]|[ivxlcdm]+|\d+)[.)]\s+)/i;

function looksTabular(lines: string[]) {
  if (lines.some((line) => /[\t|]/.test(line) || /^\s*Source:/i.test(line)))
    return true;
  return lines.some((line, i) => {
    const next = lines[i + 1];
    if (!next || line.length > 100 || next.length > 100) return false;
    if (/\S {2,}\S/.test(line) && /\S {2,}\S/.test(next)) return true;
    const cells = line.trim().split(/\s+/);
    const nextCells = next.trim().split(/\s+/);
    return (
      cells.length > 1 &&
      cells.length === nextCells.length &&
      [cells, nextCells].some((row) =>
        row.every((cell) => /^[\d.,%$+−-]+$/.test(cell)),
      )
    );
  });
}

export function normaliseStem(text: string): string {
  if (!text.trim()) return "";
  return text
    .replace(/\r\n?/g, "\n")
    .split(/(\n(?:[ \t]*\n)+)/)
    .map((block, i) => {
      if (i % 2) return block;
      const lines = block.split("\n");
      if (looksTabular(lines)) return block;
      return lines.reduce((joined, line) => {
        const trimmed = line.trim();
        if (!trimmed) return joined;
        if (!joined) return trimmed;
        if (listItem.test(line)) return `${joined}\n${trimmed}`;
        return `${joined}${/\p{L}-$/u.test(joined) ? "" : " "}${trimmed}`;
      }, "");
    })
    .join("");
}
