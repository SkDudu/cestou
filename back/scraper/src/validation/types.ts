/** SPEC 006 — deterministic validation types */

export type ValidationSeverity = "info" | "warning" | "error";

export type ValidationStatus =
  | "validated"
  | "suspicious"
  | "invalid"
  | "pending";

export type ValidationSource = "rules" | "human" | "ai";

export interface ValidationIssue {
  ruleId: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  field?: string;
  value?: unknown;
}

export interface ValidationResult {
  status: ValidationStatus;
  issues: ValidationIssue[];
  score: number;
  validatedAt: number;
  rulesVersion: string;
}

/** Input for rules — NormalizedProduct + supermarket + scrape fields. */
export interface ValidatableProduct {
  name: string;
  normalizedName?: string;
  brand?: string;
  price: number;
  originalPrice?: number;
  quantity?: number;
  unit?: string;
  url?: string;
  imageUrl?: string;
  externalId?: string;
  supermarketId: string;
  source?: string;
}

export interface ValidationContext {
  /** ponytail: optional flags from caller; no global duplicate scan in engine */
  possibleDuplicate?: boolean;
}

export interface ValidationRule {
  id: string;
  name: string;
  severity: ValidationSeverity;
  validate(
    product: ValidatableProduct,
    context: ValidationContext,
  ): ValidationIssue | null;
}

export const RULES_VERSION = "validation-v1";
