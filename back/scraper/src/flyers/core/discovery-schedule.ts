/** ponytail: spec §13 backoff — 1h, 2h, 4h, 8h cap */

export const HOUR_MS = 60 * 60 * 1000;

/** `attemptsBefore` = discoveryAttempts already stored (0 on first fail). */
export function discoveryBackoffMs(attemptsBefore: number): number {
  const shift = Math.min(Math.max(attemptsBefore, 0), 3);
  return Math.min(8 * HOUR_MS, (1 << shift) * HOUR_MS);
}

/** validUntil − 24h for each flyer; soonest future. Else now + 6h. */
export function nextRunAtFromValidities(nowMs: number, validUntilsMs: number[]): number {
  const candidates = validUntilsMs
    .map((vu) => vu - 24 * HOUR_MS)
    .filter((t) => t > nowMs);
  if (!candidates.length) return nowMs + 6 * HOUR_MS;
  return Math.min(...candidates);
}

/** Spec §10/§11: nextRunAt = min(existing ?? candidate, candidate). */
export function earlierNextRunAt(existingMs: number | null | undefined, candidateMs: number): number {
  if (existingMs == null) return candidateMs;
  return Math.min(existingMs, candidateMs);
}
