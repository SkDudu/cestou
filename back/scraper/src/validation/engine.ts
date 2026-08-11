import { defaultRules } from "./rules.js";
import {
  RULES_VERSION,
  type ValidationContext,
  type ValidationIssue,
  type ValidationResult,
  type ValidationRule,
  type ValidationStatus,
  type ValidatableProduct,
} from "./types.js";

function computeScore(issues: ValidationIssue[]): number {
  let score = 100;
  for (const i of issues) {
    if (i.severity === "error") score -= 40;
    else if (i.severity === "warning") score -= 15;
    else score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

function resolveStatus(issues: ValidationIssue[]): ValidationStatus {
  if (issues.some((i) => i.severity === "error")) return "invalid";
  if (issues.some((i) => i.severity === "warning")) return "suspicious";
  // ponytail: info-only still validated (score reflects gaps)
  return "validated";
}

export function runValidation(
  product: ValidatableProduct,
  context: ValidationContext = {},
  rules: ValidationRule[] = defaultRules,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const result = rule.validate(product, context);
    if (result) issues.push(result);
  }

  return {
    status: resolveStatus(issues),
    issues,
    score: computeScore(issues),
    validatedAt: Date.now(),
    rulesVersion: RULES_VERSION,
  };
}
