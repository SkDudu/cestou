import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  discoveryBackoffMs,
  earlierNextRunAt,
  manualNextRunAt,
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
    // sooner−24h is within 6h of now? Sep 25 12:00 − 24h = Sep 24 12:00
    // now = Sep 21 12:00 → candidate Sep 24 = 3 days → capped at now+6h
    expect(nextRunAtFromValidities(now, [later, sooner])).toBe(now + 6 * HOUR_MS);
  });

  it("uses expiry window when sooner than 6h", () => {
    const soon = now + 3 * HOUR_MS; // validUntil
    // validUntil − 24h is in the past → no candidate → fallback 6h
    expect(nextRunAtFromValidities(now, [soon])).toBe(now + 6 * HOUR_MS);
    // validUntil in 30h → window at now+6h exactly
    const vu = now + 30 * HOUR_MS;
    expect(nextRunAtFromValidities(now, [vu])).toBe(now + 6 * HOUR_MS);
    // validUntil in 26h → window at now+2h (earlier than cap)
    const near = now + 26 * HOUR_MS;
    expect(nextRunAtFromValidities(now, [near])).toBe(now + 2 * HOUR_MS);
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

describe("manualNextRunAt", () => {
  it("is always now + 1h", () => {
    const now = Date.parse("2026-09-21T12:00:00.000Z");
    expect(manualNextRunAt(now)).toBe(now + HOUR_MS);
  });
});
