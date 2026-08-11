import { PRODUCT_CATEGORIES, PRODUCT_SUBCATEGORIES } from "../config/categories.js";
import type { ProductCategory, ProductSubcategory } from "../types/query.types.js";

export function listCategories(enabledOnly = true): ProductCategory[] {
  return PRODUCT_CATEGORIES.filter((c) => (enabledOnly ? c.enabled : true)).sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );
}

export function getCategory(idOrSlug: string): ProductCategory | undefined {
  return PRODUCT_CATEGORIES.find(
    (c) => c.id === idOrSlug || c.slug === idOrSlug,
  );
}

export function listSubcategories(
  categoryId?: string,
  enabledOnly = true,
): ProductSubcategory[] {
  return PRODUCT_SUBCATEGORIES.filter((s) => {
    if (enabledOnly && !s.enabled) return false;
    if (categoryId && s.categoryId !== categoryId) return false;
    return true;
  });
}

export function getSubcategory(idOrSlug: string): ProductSubcategory | undefined {
  return PRODUCT_SUBCATEGORIES.find(
    (s) => s.id === idOrSlug || s.slug === idOrSlug,
  );
}
