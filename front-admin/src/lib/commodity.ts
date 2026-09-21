/** Keep in sync with back/scraper catalog-normalization + config/categories. */
export const NO_BRAND_LABEL = "(sem marca)";

const HORTIFRUTI_RE =
  /\b(banana|maca|laranja|limao|mamao|abacaxi|melao|melancia|uva|morango|kiwi|pera|manga|goiaba|maracuja|abacate|coco|caju|tangerina|mexerica|bergamota|caqui|figo|ameixa|pessego|nectarina|tomate|batata|cebola|alho|cenoura|alface|couve|brocolis|repolho|abobrinha|berinjela|pimentao|pepino|chuchu|quiabo|maxixe|inhame|aipim|mandioca|beterraba|rabanete|nabo|espinafre|rucula|agriao|salsa|cebolinha|coentro|vagem|ervilha|cogumelo|hortela|hortifruti|fruta|frutas|verdura|verduras|legume|legumes|milho verde|couve flor|repolho roxo)\b/;
const CARNES_RE =
  /\b(carne|carnes|bife|bifes|alcatra|picanha|costela|costelas|contrafile|file|filezinho|file mignon|frango|galinha|peito|coxa|coxao|sobrecoxa|asa|peru|bacon|linguica|salsicha|hamburguer|moida|patinho|acem|maminha|cupim|peixe|salmao|tilapia|camarao|lombo|pernil|acougue|bovina|suina|aves|fraldinha|lagarto|musculo|paleta|ancho|chorizo|panceta|toucinho|rabada|ossobuco|figado|figadinho|coracao|miudos|iscas|bisteca|costelinha|banha|carneiro|cordeiro|caprino|bucho|dobradinha|kibe|quibe|almondega|nugget|empanado|sashimi|atum|bacalhau|sardinha|merluza|pescada|polvo|lula|mexilhao|ostras?)\b/;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isIntentionalNoBrand(brand: string | null | undefined): boolean {
  if (!brand?.trim()) return false;
  const n = normalize(brand);
  return n === "sem marca" || brand.trim() === NO_BRAND_LABEL;
}

export function isCommodityCategory(category: string | null | undefined): boolean {
  return (
    category === "hortifruti" ||
    category === "carnes"
  );
}

/** Produce / fresh meat — brand absence is expected, not a catalog bug. */
export function isCommodityOffer(name: string): boolean {
  const hay = normalize(name);
  return HORTIFRUTI_RE.test(hay) || CARNES_RE.test(hay);
}

/** Missing-brand queue membership. */
export function needsBrandFix(o: {
  brand?: string | null;
  brandId?: string | null;
  name: string;
  canonicalProduct?: { category?: string | null } | null;
}): boolean {
  if (o.brandId) return false;
  if (isIntentionalNoBrand(o.brand)) return false;
  if (isCommodityCategory(o.canonicalProduct?.category)) return false;
  if (isCommodityOffer(o.name)) return false;
  return !o.brand;
}
