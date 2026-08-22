const DEFAULT_TZ = "America/Fortaleza";

function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - utcMs;
}

function zonedLocalToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  se: number,
  timeZone: string,
): number {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, se);
  return utcGuess - tzOffsetMs(timeZone, utcGuess);
}

/** Parse site validity string/epoch into UTC ms. Date-only until → 23:59:59 in TZ. */
export function parseValidity(
  raw: string | number | undefined | null,
  timeZone = DEFAULT_TZ,
  role: "from" | "until" = "from",
): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined;
    return raw < 1e12 ? Math.round(raw * 1000) : raw;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  if (/Z|[+-]\d{2}:\d{2}$/.test(s)) {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? undefined : ms;
  }
  const br = s.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  const iso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  let y: number;
  let mo: number;
  let d: number;
  let h = 0;
  let mi = 0;
  let se = 0;
  let dateOnly = false;
  if (br) {
    d = +br[1]!;
    mo = +br[2]!;
    const rawY = br[3];
    y = rawY
      ? rawY.length <= 2
        ? 2000 + +rawY
        : +rawY
      : new Date().getFullYear();
    dateOnly = !br[4];
    h = +(br[4] ?? 0);
    mi = +(br[5] ?? 0);
    se = +(br[6] ?? 0);
  } else if (iso) {
    y = +iso[1]!;
    mo = +iso[2]!;
    d = +iso[3]!;
    dateOnly = !iso[4];
    h = +(iso[4] ?? 0);
    mi = +(iso[5] ?? 0);
    se = +(iso[6] ?? 0);
  } else {
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? undefined : ms;
  }
  if (dateOnly && role === "until") {
    h = 23;
    mi = 59;
    se = 59;
  }
  return zonedLocalToUtc(y, mo, d, h, mi, se, timeZone);
}

export function extractSkipReason(
  flyer: { validFrom?: number; validUntil?: number },
  now = Date.now(),
  windowMs = 24 * 60 * 60 * 1000,
): string | null {
  if (flyer.validUntil !== undefined && flyer.validUntil < now) {
    return "validUntil expirado";
  }
  if (
    flyer.validFrom !== undefined &&
    flyer.validFrom > now &&
    flyer.validFrom - now > windowMs
  ) {
    return "validFrom futuro";
  }
  return null;
}

export function shouldExtractNow(
  flyer: { validFrom?: number; validUntil?: number },
  now = Date.now(),
  windowMs = 24 * 60 * 60 * 1000,
): boolean {
  return extractSkipReason(flyer, now, windowMs) === null;
}
