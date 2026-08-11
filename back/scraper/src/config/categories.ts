import type { ProductCategory, ProductSubcategory } from "../types/query.types.js";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: "mercearia", name: "Mercearia", slug: "mercearia", enabled: true, priority: 1 },
  { id: "laticinios", name: "Laticínios", slug: "laticinios", enabled: true, priority: 1 },
  { id: "carnes", name: "Carnes", slug: "carnes", enabled: true, priority: 1 },
  { id: "frios", name: "Frios", slug: "frios", enabled: true, priority: 1 },
  { id: "hortifruti", name: "Hortifruti", slug: "hortifruti", enabled: true, priority: 1 },
  { id: "bebidas", name: "Bebidas", slug: "bebidas", enabled: true, priority: 1 },
  { id: "congelados", name: "Congelados", slug: "congelados", enabled: true, priority: 2 },
  { id: "padaria", name: "Padaria", slug: "padaria", enabled: true, priority: 2 },
  { id: "doces", name: "Doces", slug: "doces", enabled: true, priority: 2 },
  { id: "limpeza", name: "Limpeza", slug: "limpeza", enabled: true, priority: 1 },
  { id: "higiene", name: "Higiene Pessoal", slug: "higiene", description: "Produtos de higiene e cuidados pessoais", enabled: true, priority: 1 },
  { id: "higiene_bucal", name: "Higiene Bucal", slug: "higiene_bucal", enabled: true, priority: 1 },
  { id: "bebes", name: "Bebês", slug: "bebes", enabled: true, priority: 2 },
  { id: "pet", name: "Pet", slug: "pet", enabled: true, priority: 2 },
  { id: "utilidades", name: "Utilidades", slug: "utilidades", enabled: true, priority: 3 },
  { id: "descartaveis", name: "Descartáveis", slug: "descartaveis", enabled: true, priority: 3 },
  { id: "papelaria", name: "Papelaria", slug: "papelaria", enabled: true, priority: 3 },
  { id: "churrasco", name: "Churrasco", slug: "churrasco", enabled: true, priority: 3 },
  { id: "inseticidas", name: "Inseticidas", slug: "inseticidas", enabled: true, priority: 3 },
  { id: "farmacia", name: "Farmácia", slug: "farmacia", enabled: true, priority: 2 },
];

export const PRODUCT_SUBCATEGORIES: ProductSubcategory[] = [
  { id: "mercearia_arroz", categoryId: "mercearia", name: "Arroz", slug: "arroz", enabled: true },
  { id: "mercearia_feijao", categoryId: "mercearia", name: "Feijão", slug: "feijao", enabled: true },
  { id: "mercearia_massas", categoryId: "mercearia", name: "Massas", slug: "massas", enabled: true },
  { id: "mercearia_farinhas", categoryId: "mercearia", name: "Farinhas", slug: "farinhas", enabled: true },
  { id: "mercearia_temperos", categoryId: "mercearia", name: "Temperos", slug: "temperos", enabled: true },
  { id: "mercearia_molhos", categoryId: "mercearia", name: "Molhos", slug: "molhos", enabled: true },
  { id: "mercearia_enlatados", categoryId: "mercearia", name: "Enlatados", slug: "enlatados", enabled: true },
  { id: "higiene_cabelo", categoryId: "higiene", name: "Cabelo", slug: "cabelo", enabled: true },
  { id: "higiene_corpo", categoryId: "higiene", name: "Corpo", slug: "corpo", enabled: true },
  { id: "higiene_bucal", categoryId: "higiene", name: "Higiene Bucal", slug: "higiene_bucal", enabled: true },
  { id: "higiene_barbear", categoryId: "higiene", name: "Barbear", slug: "barbear", enabled: true },
  { id: "higiene_cuidados", categoryId: "higiene", name: "Cuidados Pessoais", slug: "cuidados_pessoais", enabled: true },
];
