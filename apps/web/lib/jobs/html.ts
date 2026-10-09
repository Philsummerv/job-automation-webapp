// Small, dependency-free HTML -> plain text helpers for job descriptions and
// fetched pages. Not a full HTML parser: good enough to hand readable text to
// a model and to show a snippet in the UI.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  trade: "™",
  reg: "®",
  copy: "©",
};

/** Decodes HTML entities (named, decimal, hex). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return m;
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/**
 * HTML -> readable plain text. Handles HTML that arrives entity-escaped
 * (Greenhouse and Arbeitnow send "&lt;p&gt;..."). Drops script/style/etc.,
 * turns block tags into line breaks and list items into "- " lines.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  // Entity-escaped HTML: decode once so the tags become real tags.
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(s) && !/<[a-z]/i.test(s)) {
    s = decodeEntities(s);
  }
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|template|svg|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(p|div|section|article|h[1-6]|ul|ol|tr|table|blockquote|header|main)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/\r/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Caps text at `max` chars, cutting at a word boundary when possible. */
export function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut) + " …";
}
