export type QueryFrequency = "high" | "medium" | "low";

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  priority: number;
}

export interface ProductSubcategory {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  enabled: boolean;
}

export interface ScraperQuery {
  id: string;
  query: string;
  categoryId: string;
  subcategoryId?: string;
  enabled: boolean;
  priority: number;
  maxProducts?: number;
  frequency?: QueryFrequency;
}

export interface QueryFilters {
  category?: string;
  subcategory?: string;
  query?: string;
  priority?: number;
  frequency?: QueryFrequency;
}
