/** Top-level product categories for flyer offers + scraper query catalog. */

export const PRODUCT_CATEGORIES = [
  { id: "mercearia", name: "Mercearia", slug: "mercearia" },
  { id: "laticinios", name: "Laticínios", slug: "laticinios" },
  { id: "carnes", name: "Carnes", slug: "carnes" },
  { id: "frios", name: "Frios", slug: "frios" },
  { id: "hortifruti", name: "Hortifruti", slug: "hortifruti" },
  { id: "bebidas", name: "Bebidas", slug: "bebidas" },
  { id: "congelados", name: "Congelados", slug: "congelados" },
  { id: "padaria", name: "Padaria", slug: "padaria" },
  { id: "doces", name: "Doces", slug: "doces" },
  { id: "limpeza", name: "Limpeza", slug: "limpeza" },
  { id: "higiene", name: "Higiene Pessoal", slug: "higiene" },
  { id: "bebes", name: "Bebês", slug: "bebes" },
  { id: "pet", name: "Pet", slug: "pet" },
  { id: "utilidades", name: "Utilidades", slug: "utilidades" },
  { id: "descartaveis", name: "Descartáveis", slug: "descartaveis" },
  { id: "papelaria", name: "Papelaria", slug: "papelaria" },
  { id: "churrasco", name: "Churrasco", slug: "churrasco" },
  { id: "inseticidas", name: "Inseticidas", slug: "inseticidas" },
  { id: "farmacia", name: "Farmácia", slug: "farmacia" },
] as const;

export type ProductCategoryId = (typeof PRODUCT_CATEGORIES)[number]["id"];

export const PRODUCT_CATEGORY_IDS: ReadonlySet<string> = new Set(
  PRODUCT_CATEGORIES.map((c) => c.id),
);

/** Legacy MiMo / DB values → current slug. */
export const PRODUCT_CATEGORY_ALIASES: Record<string, ProductCategoryId> = {
  acougue: "carnes",
};

export const PRODUCT_SUBCATEGORIES = {
  higiene: [
    "cabelo",
    "corpo",
    "higiene_bucal",
    "barbear",
    "cuidados_pessoais",
  ],
  mercearia: [
    "arroz",
    "feijao",
    "massas",
    "farinhas",
    "temperos",
    "molhos",
    "enlatados",
    "conservas",
  ],
} as const;

const LABEL_BY_ID = Object.fromEntries(
  PRODUCT_CATEGORIES.map((c) => [c.id, c.name]),
) as Record<ProductCategoryId, string>;

/** Pipe-joined enum for MiMo prompt schema. */
export const PRODUCT_CATEGORY_ENUM =
  PRODUCT_CATEGORIES.map((c) => c.id).join("|");

export function isProductCategoryId(
  value: string | null | undefined,
): value is ProductCategoryId {
  return Boolean(value && PRODUCT_CATEGORY_IDS.has(value));
}

/** Normalize raw category from MiMo / rawText. Alias acougue → carnes. */
export function parseProductCategory(
  raw: unknown,
): ProductCategoryId | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  const mapped = PRODUCT_CATEGORY_ALIASES[key] ?? key;
  return isProductCategoryId(mapped) ? mapped : undefined;
}

export function categoryLabel(
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const normalized = parseProductCategory(id) ?? id;
  if (isProductCategoryId(normalized)) return LABEL_BY_ID[normalized];
  return null;
}
