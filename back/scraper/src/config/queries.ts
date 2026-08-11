import type { QueryFrequency, ScraperQuery } from "../types/query.types.js";

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function q(
  categoryId: string,
  query: string,
  opts: Partial<Omit<ScraperQuery, "id" | "query" | "categoryId">> = {},
): ScraperQuery {
  return {
    id: `${categoryId}-${slugify(query)}`,
    query,
    categoryId,
    enabled: true,
    priority: 1,
    frequency: "medium",
    ...opts,
  };
}

const high = { priority: 1, frequency: "high" as QueryFrequency };
const med = { priority: 1, frequency: "medium" as QueryFrequency };
const low = { priority: 2, frequency: "low" as QueryFrequency };
const lowP3 = { priority: 3, frequency: "low" as QueryFrequency };

/** Catálogo estático — fonte da verdade (não vai no .env). SPEC 003. */
export const SCRAPER_QUERIES: ScraperQuery[] = [
  // MERCEARIA
  q("mercearia", "arroz", { ...high, subcategoryId: "mercearia_arroz" }),
  q("mercearia", "feijão", { ...high, subcategoryId: "mercearia_feijao" }),
  q("mercearia", "lentilha", med),
  q("mercearia", "macarrão", { ...med, subcategoryId: "mercearia_massas" }),
  q("mercearia", "farinha", { ...med, subcategoryId: "mercearia_farinhas" }),
  q("mercearia", "farofa", low),
  q("mercearia", "açúcar", high),
  q("mercearia", "sal", med),
  q("mercearia", "café", high),
  q("mercearia", "óleo", high),
  q("mercearia", "azeite", med),
  q("mercearia", "vinagre", low),
  q("mercearia", "molhos", { ...med, subcategoryId: "mercearia_molhos" }),
  q("mercearia", "temperos", { ...med, subcategoryId: "mercearia_temperos" }),
  q("mercearia", "enlatados", { ...med, subcategoryId: "mercearia_enlatados" }),
  q("mercearia", "conservas", low),

  // LATICÍNIOS
  q("laticinios", "leite", high),
  q("laticinios", "leite em pó", med),
  q("laticinios", "leite zero lactose", med),
  q("laticinios", "manteiga", med),
  q("laticinios", "margarina", med),
  q("laticinios", "queijo", med),
  q("laticinios", "requeijão", med),
  q("laticinios", "cream cheese", low),
  q("laticinios", "iogurte", med),
  q("laticinios", "bebida láctea", low),

  // CARNES
  q("carnes", "carne", high),
  q("carnes", "carne moída", high),
  q("carnes", "frango", high),
  q("carnes", "peito de frango", high),
  q("carnes", "linguiça", med),
  q("carnes", "salsicha", med),
  q("carnes", "bacon", med),
  q("carnes", "peixe", med),

  // FRIOS
  q("frios", "presunto", med),
  q("frios", "mortadela", med),
  q("frios", "peito de peru", med),
  q("frios", "salame", low),

  // HORTIFRUTI
  q("hortifruti", "banana", high),
  q("hortifruti", "maçã", med),
  q("hortifruti", "laranja", med),
  q("hortifruti", "mamão", med),
  q("hortifruti", "manga", low),
  q("hortifruti", "tomate", high),
  q("hortifruti", "cebola", high),
  q("hortifruti", "alho", med),
  q("hortifruti", "batata", high),
  q("hortifruti", "cenoura", med),
  q("hortifruti", "alface", med),

  // BEBIDAS
  q("bebidas", "água", med),
  q("bebidas", "refrigerante", med),
  q("bebidas", "suco", med),
  q("bebidas", "energético", low),
  q("bebidas", "cerveja", med),
  q("bebidas", "chá", low),

  // CONGELADOS
  q("congelados", "pizza", med),
  q("congelados", "hambúrguer", med),
  q("congelados", "nuggets", med),
  q("congelados", "sorvete", low),

  // PADARIA
  q("padaria", "pão", med),
  q("padaria", "pão de forma", med),
  q("padaria", "bolo", low),

  // DOCES
  q("doces", "biscoito", med),
  q("doces", "chocolate", med),
  q("doces", "doce de leite", low),
  q("doces", "geleia", low),

  // LIMPEZA
  q("limpeza", "detergente", med),
  q("limpeza", "sabão em pó", med),
  q("limpeza", "sabão líquido", med),
  q("limpeza", "sabão em barra", med),
  q("limpeza", "amaciante", med),
  q("limpeza", "desinfetante", med),
  q("limpeza", "água sanitária", med),
  q("limpeza", "alvejante", low),
  q("limpeza", "tira manchas", low),
  q("limpeza", "limpador multiuso", med),
  q("limpeza", "limpa vidros", low),
  q("limpeza", "limpa pisos", low),
  q("limpeza", "esponja", low),
  q("limpeza", "esponja de aço", low),
  q("limpeza", "saco de lixo", med),

  // HIGIENE
  q("higiene", "shampoo", { ...med, subcategoryId: "higiene_cabelo" }),
  q("higiene", "condicionador", { ...med, subcategoryId: "higiene_cabelo" }),
  q("higiene", "sabonete", { ...med, subcategoryId: "higiene_corpo" }),
  q("higiene", "desodorante", { ...med, subcategoryId: "higiene_cuidados" }),
  q("higiene", "papel higiênico", med),
  q("higiene", "papel toalha", med),
  q("higiene", "absorvente", med),
  q("higiene", "escova de dente", { ...med, subcategoryId: "higiene_bucal" }),
  q("higiene", "escova de dente infantil", { ...low, subcategoryId: "higiene_bucal" }),
  q("higiene", "pasta de dente", { ...med, subcategoryId: "higiene_bucal" }),
  q("higiene", "fio dental", { ...low, subcategoryId: "higiene_bucal" }),
  q("higiene", "enxaguante bucal", { ...med, subcategoryId: "higiene_bucal" }),
  q("higiene", "refil de escova de dente", { ...lowP3, subcategoryId: "higiene_bucal" }),
  q("higiene", "aparelho de barbear", { ...low, subcategoryId: "higiene_barbear" }),

  // BEBÊS
  q("bebes", "fralda", med),
  q("bebes", "lenço umedecido", med),
  q("bebes", "leite infantil", med),
  q("bebes", "papinha", low),

  // PET
  q("pet", "ração cachorro", med),
  q("pet", "ração gato", med),
  q("pet", "areia gato", med),
  q("pet", "petisco cachorro", low),

  // UTILIDADES
  q("utilidades", "vela", lowP3),
  q("utilidades", "pilha", lowP3),
  q("utilidades", "lâmpada", lowP3),
  q("utilidades", "fósforo", lowP3),

  // DESCARTÁVEIS
  q("descartaveis", "copo descartável", lowP3),
  q("descartaveis", "prato descartável", lowP3),
  q("descartaveis", "guardanapo", low),

  // PAPELARIA
  q("papelaria", "caderno", lowP3),
  q("papelaria", "caneta", lowP3),

  // CHURRASCO
  q("churrasco", "carvão", low),
  q("churrasco", "sal grosso", low),

  // INSETICIDAS
  q("inseticidas", "inseticida", low),
  q("inseticidas", "repelente", low),

  // FARMÁCIA
  q("farmacia", "dipirona", med),
  q("farmacia", "paracetamol", med),
  q("farmacia", "vitamina c", low),
];
