import { SCRAPER_QUERIES } from "../config/queries.js";
import { getCategory } from "./category.service.js";
import type { QueryFilters, ScraperQuery } from "../types/query.types.js";

export function listAllQueries(): ScraperQuery[] {
  return [...SCRAPER_QUERIES];
}

/** Enabled queries, sorted by priority then id. Optional filters. */
export function resolveQueries(filters: QueryFilters = {}): ScraperQuery[] {
  let list = SCRAPER_QUERIES.filter((q) => q.enabled);

  if (filters.category) {
    const cat = getCategory(filters.category);
    const catId = cat?.id ?? filters.category;
    list = list.filter((q) => q.categoryId === catId);
  }

  if (filters.subcategory) {
    const sub = filters.subcategory;
    list = list.filter(
      (q) =>
        q.subcategoryId === sub ||
        q.subcategoryId === `higiene_${sub}` ||
        q.subcategoryId?.endsWith(`_${sub}`) ||
        q.subcategoryId?.endsWith(sub),
    );
  }

  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const exact = list.filter(
      (q) => q.query.toLowerCase() === needle || q.id === filters.query,
    );
    list = exact.length > 0 ? exact : list.filter((q) => q.query.toLowerCase().includes(needle));
  }

  if (filters.priority != null) {
    list = list.filter((q) => q.priority === filters.priority);
  }

  if (filters.frequency) {
    list = list.filter((q) => q.frequency === filters.frequency);
  }

  return list.sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
}
