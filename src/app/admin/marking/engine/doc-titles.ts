type Doc = { id: string; text: string };

const AIRO = /^AIRO-(\d+)(?:-(\d+))?([a-z]?)$/i;
const FIXED: Record<string, string> = {
  ENGINE: "Engine",
  CHANGELOG: "Changelog",
};

function airoVersion(id: string) {
  const match = AIRO.exec(id);
  return match
    ? {
        major: Number(match[1]),
        minor: Number(match[2] ?? 0),
        suffix: match[3].toLowerCase(),
      }
    : null;
}

/** Readable doc title; the id (and its URL) stays the file name. */
export function docTitle({ id, text }: Doc) {
  if (FIXED[id]) return FIXED[id];
  const version = airoVersion(id);
  if (version) return `Airo ${version.major}.${version.minor}${version.suffix}`;
  const heading = /^#\s+(.+?)\s*$/m.exec(text)?.[1];
  if (heading) return heading;
  const words = id.toLowerCase().replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Engine, Changelog, Airo versions newest first, then the rest by title. */
export function orderDocs<T extends Doc>(docs: T[]) {
  const rank = (doc: T) =>
    doc.id === "ENGINE"
      ? 0
      : doc.id === "CHANGELOG"
        ? 1
        : airoVersion(doc.id)
          ? 2
          : 3;
  return [...docs].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    const va = airoVersion(a.id),
      vb = airoVersion(b.id);
    if (va && vb)
      return (
        vb.major - va.major ||
        vb.minor - va.minor ||
        vb.suffix.localeCompare(va.suffix)
      );
    return docTitle(a).localeCompare(docTitle(b));
  });
}
