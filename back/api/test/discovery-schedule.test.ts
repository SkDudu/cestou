import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  discoveryBackoffMs,
  earlierNextRunAt,
  nextRunAtFromValidities,
} from "../../scraper/src/flyers/core/discovery-schedule.js";

describe("discoveryBackoffMs", () => {
  it("scales 1h → 2h → 4h → 8h and caps", () => {
    expect(discoveryBackoffMs(0)).toBe(1 * HOUR_MS);
    expect(discoveryBackoffMs(1)).toBe(2 * HOUR_MS);
    expect(discoveryBackoffMs(2)).toBe(4 * HOUR_MS);
    expect(discoveryBackoffMs(3)).toBe(8 * HOUR_MS);
    expect(discoveryBackoffMs(9)).toBe(8 * HOUR_MS);
  });
});

describe("nextRunAtFromValidities", () => {
  const now = Date.parse("2026-09-21T12:00:00.000Z");

  it("picks soonest validUntil − 24h in the future", () => {
    const later = Date.parse("2026-09-30T12:00:00.000Z");
    const sooner = Date.parse("2026-09-25T12:00:00.000Z");
    expect(nextRunAtFromValidities(now, [later, sooner])).toBe(sooner - 24 * HOUR_MS);
  });

  it("falls back to now + 6h when no future window", () => {
    const past = Date.parse("2026-09-20T12:00:00.000Z");
    expect(nextRunAtFromValidities(now, [past])).toBe(now + 6 * HOUR_MS);
    expect(nextRunAtFromValidities(now, [])).toBe(now + 6 * HOUR_MS);
  });
});

describe("earlierNextRunAt", () => {
  it("uses candidate when existing null; else min", () => {
    expect(earlierNextRunAt(null, 100)).toBe(100);
    expect(earlierNextRunAt(undefined, 100)).toBe(100);
    expect(earlierNextRunAt(200, 100)).toBe(100);
    expect(earlierNextRunAt(50, 100)).toBe(50);
  });
});
