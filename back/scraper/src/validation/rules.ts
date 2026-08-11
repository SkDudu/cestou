import { validationConfig } from "./config.js";
import type {
  ValidationContext,
  ValidationIssue,
  ValidationRule,
  ValidatableProduct,
} from "./types.js";

function issue(
  rule: ValidationRule,
  code: string,
  message: string,
  field?: string,
  value?: unknown,
): ValidationIssue {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    code,
    message,
    field,
    value,
  };
}

const requiredFields: ValidationRule = {
  id: "required-fields",
  name: "Required fields",
  severity: "error",
  validate(p) {
    if (!p.supermarketId) {
      return issue(this, "MISSING_SUPERMARKET", "supermarketId is required", "supermarketId");
    }
    if (!p.name?.trim()) {
      return issue(this, "MISSING_NAME", "Product name is required", "name", p.name);
    }
    if (typeof p.price !== "number" || Number.isNaN(p.price)) {
      return issue(this, "MISSING_PRICE", "Product price is required", "price", p.price);
    }
    return null;
  },
};

const nameRule: ValidationRule = {
  id: "name",
  name: "Product name",
  severity: "error",
  validate(p) {
    const name = p.name?.trim() ?? "";
    if (name.length < validationConfig.minNameLength) {
      return issue(
        this,
        "NAME_TOO_SHORT",
        `Name shorter than ${validationConfig.minNameLength}`,
        "name",
        name,
      );
    }
    if (name.length > validationConfig.maxNameLength) {
      return issue(
        this,
        "NAME_TOO_LONG",
        `Name longer than ${validationConfig.maxNameLength}`,
        "name",
        name.length,
      );
    }
    return null;
  },
};

const suspiciousName: ValidationRule = {
  id: "suspicious-name",
  name: "Suspicious name",
  severity: "warning",
  validate(p) {
    const name = p.name?.trim() ?? "";
    if (/^\d+$/.test(name)) {
      return issue(this, "NAME_ONLY_DIGITS", "Name is only digits", "name", name);
    }
    if (/R\s*\$/i.test(name) || /\b\d+[.,]\d{2}\b/.test(name)) {
      return issue(
        this,
        "PRICE_IN_PRODUCT_NAME",
        "Name may contain a price",
        "name",
        name,
      );
    }
    return null;
  },
};

const priceRule: ValidationRule = {
  id: "price",
  name: "Price positive",
  severity: "error",
  validate(p) {
    if (!Number.isFinite(p.price) || p.price <= 0) {
      return issue(
        this,
        "INVALID_PRICE",
        "Product price must be greater than zero",
        "price",
        p.price,
      );
    }
    return null;
  },
};

const suspiciousPrice: ValidationRule = {
  id: "suspicious-price",
  name: "Suspicious price",
  severity: "warning",
  validate(p) {
    if (Number.isFinite(p.price) && p.price > validationConfig.maxSuspiciousPrice) {
      return issue(
        this,
        "SUSPICIOUS_PRICE",
        `Price above R$ ${validationConfig.maxSuspiciousPrice}`,
        "price",
        p.price,
      );
    }
    return null;
  },
};

const promotionRule: ValidationRule = {
  id: "promotion",
  name: "Promotion consistency",
  severity: "warning",
  validate(p) {
    if (p.originalPrice == null) return null;
    if (!Number.isFinite(p.originalPrice)) {
      return issue(
        this,
        "INVALID_ORIGINAL_PRICE",
        "originalPrice is not finite",
        "originalPrice",
        p.originalPrice,
      );
    }
    if (p.originalPrice <= p.price) {
      return issue(
        this,
        "INCONSISTENT_PROMOTION",
        "originalPrice must be greater than price",
        "originalPrice",
        p.originalPrice,
      );
    }
    return null;
  },
};

const quantityRule: ValidationRule = {
  id: "quantity",
  name: "Quantity",
  severity: "error",
  validate(p) {
    if (p.quantity == null) return null;
    if (!Number.isFinite(p.quantity) || p.quantity <= 0) {
      return issue(
        this,
        "INVALID_QUANTITY",
        "Quantity must be greater than zero",
        "quantity",
        p.quantity,
      );
    }
    return null;
  },
};

const unitRule: ValidationRule = {
  id: "unit",
  name: "Unit",
  severity: "warning",
  validate(p) {
    if (p.unit == null || p.unit === "") return null;
    const u = p.unit.toLowerCase();
    if (!validationConfig.knownUnits.has(u)) {
      return issue(this, "UNKNOWN_UNIT", `Unknown unit: ${p.unit}`, "unit", p.unit);
    }
    return null;
  },
};

const quantityUnitRule: ValidationRule = {
  id: "quantity-unit",
  name: "Quantity requires unit",
  severity: "warning",
  validate(p) {
    if (p.quantity != null && (p.unit == null || p.unit === "")) {
      return issue(
        this,
        "QUANTITY_WITHOUT_UNIT",
        "Quantity present without unit",
        "unit",
      );
    }
    return null;
  },
};

const imageRule: ValidationRule = {
  id: "image",
  name: "Image URL",
  severity: "info",
  validate(p) {
    if (!p.imageUrl?.trim()) {
      return issue(this, "MISSING_IMAGE", "Missing image URL", "imageUrl");
    }
    if (!/^https?:\/\//i.test(p.imageUrl)) {
      return issue(
        this,
        "INVALID_IMAGE_URL",
        "imageUrl must be http(s)",
        "imageUrl",
        p.imageUrl,
      );
    }
    return null;
  },
};

const urlRule: ValidationRule = {
  id: "url",
  name: "Product URL",
  severity: "info",
  validate(p) {
    if (!p.url?.trim()) {
      return issue(this, "MISSING_URL", "Missing product URL", "url");
    }
    if (!/^https?:\/\//i.test(p.url)) {
      return issue(this, "INVALID_URL", "url must be http(s)", "url", p.url);
    }
    return null;
  },
};

const externalIdRule: ValidationRule = {
  id: "external-id",
  name: "External ID",
  severity: "info",
  validate(p) {
    if (!p.externalId?.trim()) {
      return issue(this, "MISSING_EXTERNAL_ID", "Missing external ID", "externalId");
    }
    return null;
  },
};

const brandRule: ValidationRule = {
  id: "brand",
  name: "Brand",
  severity: "info",
  validate(p) {
    if (!p.brand?.trim()) {
      return issue(this, "MISSING_BRAND", "Missing brand", "brand");
    }
    return null;
  },
};

const duplicateRule: ValidationRule = {
  id: "duplicate",
  name: "Possible duplicate",
  severity: "warning",
  validate(_p, ctx: ValidationContext) {
    if (ctx.possibleDuplicate) {
      return issue(this, "POSSIBLE_DUPLICATE", "Possible duplicate product");
    }
    return null;
  },
};

export const defaultRules: ValidationRule[] = [
  requiredFields,
  nameRule,
  suspiciousName,
  priceRule,
  suspiciousPrice,
  promotionRule,
  quantityRule,
  unitRule,
  quantityUnitRule,
  imageRule,
  urlRule,
  externalIdRule,
  brandRule,
  duplicateRule,
];
