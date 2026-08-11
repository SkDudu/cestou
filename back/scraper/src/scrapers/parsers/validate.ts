import type { RawProduct } from "../types/index.js";
import { logger } from "../utils/logger.js";

export function validateRaw(raw: RawProduct): boolean {
  if (!raw.name?.trim()) {
    logger.error("Failed to parse product: missing name");
    return false;
  }
  if (typeof raw.price !== "number" || Number.isNaN(raw.price) || raw.price < 0) {
    logger.error(`Failed to parse product: bad price (${raw.name})`);
    return false;
  }
  if (!raw.source) {
    logger.error(`Failed to parse product: missing source (${raw.name})`);
    return false;
  }
  return true;
}
