export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeProductName(name: string): string {
  return normalizeWhitespace(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const UNKNOWN_RE =
  /^(unknown|n\/a|n\.a\.?|nao identificado|não identificado|null|none|-)$/i;

const UNIT_MAP: Record<string, string> = {
  lt: "l",
  litro: "l",
  litros: "l",
  und: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
  kilo: "kg",
  kilos: "kg",
  kgs: "kg",
};

export const VALID_UNITS = new Set([
  "kg",
  "g",
  "l",
  "ml",
  "un",
  "cx",
  "pct",
  "pack",
  "fd",
]);

export function stripUnknown(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s || UNKNOWN_RE.test(s)) return undefined;
  return s;
}

export function sanitizeName(name: string): string {
  return normalizeWhitespace(
    name.replace(/[^\p{L}\p{N}\s\-\/%.,+]/gu, " "),
  );
}

export function titleCaseBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function normalizeUnit(unit: string): string | undefined {
  const u = unit.toLowerCase().replace(/\.$/, "").trim();
  const mapped = UNIT_MAP[u] ?? u;
  return VALID_UNITS.has(mapped) ? mapped : undefined;
}

export function nameDedupeKey(name: string): string {
  return normalizeProductName(name).replace(
    /(\d+)\s+(kg|g|ml|l|un)\b/g,
    "$1$2",
  );
}
