/** Mirrors back/scraper/src/config/categories.ts — display labels for client UI. */

export const PRODUCT_CATEGORIES = [
  { id: "mercearia", name: "Mercearia" },
  { id: "laticinios", name: "Laticínios" },
  { id: "carnes", name: "Carnes" },
  { id: "frios", name: "Frios" },
  { id: "hortifruti", name: "Hortifruti" },
  { id: "bebidas", name: "Bebidas" },
  { id: "congelados", name: "Congelados" },
  { id: "padaria", name: "Padaria" },
  { id: "doces", name: "Doces" },
  { id: "limpeza", name: "Limpeza" },
  { id: "higiene", name: "Higiene Pessoal" },
  { id: "bebes", name: "Bebês" },
  { id: "pet", name: "Pet" },
  { id: "utilidades", name: "Utilidades" },
  { id: "descartaveis", name: "Descartáveis" },
  { id: "papelaria", name: "Papelaria" },
  { id: "churrasco", name: "Churrasco" },
  { id: "inseticidas", name: "Inseticidas" },
  { id: "farmacia", name: "Farmácia" },
] as const;

/** Empty string = sem categoria (Outros). */
export const OTHER_CATEGORY_ID = "";

const LABEL: Record<string, string> = Object.fromEntries(
  PRODUCT_CATEGORIES.map((c) => [c.id, c.name]),
);

const ORDER = PRODUCT_CATEGORIES.map((c) => c.id);

export function normalizeCategoryId(
  id: string | null | undefined,
): string {
  if (!id) return OTHER_CATEGORY_ID;
  if (id === "acougue") return "carnes";
  return id;
}

export function categoryLabel(id: string | null | undefined): string {
  const key = normalizeCategoryId(id);
  if (!key) return "Outros";
  return LABEL[key] ?? "Outros";
}

export function categorySortKey(id: string | null | undefined): number {
  const key = normalizeCategoryId(id);
  if (!key) return ORDER.length;
  const idx = ORDER.indexOf(key as (typeof ORDER)[number]);
  return idx === -1 ? ORDER.length : idx;
}
