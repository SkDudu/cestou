export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatInstallment(o: {
  installmentCount?: number | null;
  installmentAmount?: number | null;
  installmentInterestFree?: boolean | null;
}) {
  if (!o.installmentCount || o.installmentAmount == null) return null;
  const money = formatCurrency(o.installmentAmount);
  return `${o.installmentCount}x de ${money}${o.installmentInterestFree ? " sem juros" : ""}`;
}

export const PACK_UNITS = [
  "kg",
  "g",
  "l",
  "ml",
  "un",
  "cx",
  "pct",
  "pack",
  "fd",
] as const;

export function formatPack(
  quantity?: string | null,
  unit?: string | null,
): string | null {
  const q = quantity?.trim();
  const u = unit?.trim();
  if (!q && !u) return null;
  if (q && u) return `${q} ${u}`;
  return q || u || null;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatCompact(value: number) {
  if (value < 1000) return formatNumber(value);
  const k = value / 1000;
  const n = k >= 10 ? k.toFixed(0) : k.toFixed(1);
  return `${n.replace(/\.0$/, "")}k`;
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatOpsStamp(ts: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

export function formatRange(from?: number | null, until?: number | null) {
  if (!from && !until) return "—";
  const fmt = (ts: number) =>
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
      ts,
    );
  if (from && until) return `${fmt(from)}–${fmt(until)}`;
  return fmt((from ?? until)!);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `now` to `until` in TZ (0 = same local day). */
export function calendarDaysUntil(
  until: number,
  now = Date.now(),
  timeZone = "America/Fortaleza",
): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymdUtc = (ms: number) => {
    const [y, m, d] = fmt.format(new Date(ms)).split("-").map(Number);
    return Date.UTC(y!, m! - 1, d);
  };
  return Math.round((ymdUtc(until) - ymdUtc(now)) / DAY_MS);
}

/** Pill copy: never "2d" when end day is today. */
export function formatExpiryPill(
  until: number,
  now = Date.now(),
  timeZone = "America/Fortaleza",
): string | null {
  if (until <= now) return null;
  const days = calendarDaysUntil(until, now, timeZone);
  if (days <= 0) return "Expira hoje";
  return `Expira em ${days}d`;
}

export function formatDelta(current: number, previous?: number | null) {
  if (previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

export function formatDateTime(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(ts);
}

export function formatRelative(ts: number | null | undefined) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function isRunCancelled(run: {
  status?: string;
  error?: string | null;
  log?: string | null;
}) {
  return (
    run.status === "cancelled" ||
    run.error === "cancelled" ||
    (run.log ?? "").startsWith("cancelled")
  );
}

export function isRunDuplicate(run: {
  status?: string;
  error?: string | null;
  log?: string | null;
}) {
  return (
    run.status === "duplicate" ||
    run.error === "duplicate" ||
    (run.log ?? "").startsWith("duplicate")
  );
}

export function jobLabel(id: string) {
  return `job_${id.slice(-4)}`;
}

export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes === 0) return `${rem}s`;
  return `${minutes}m ${rem}s`;
}

export function qualityScore(raw: {
  name: string;
  brand?: string;
  externalId?: string;
  imageUrl?: string;
  url?: string;
  price: number;
}) {
  let score = 0;
  if (raw.name.length >= 3) score += 20;
  if (raw.price > 0) score += 20;
  if (raw.brand) score += 15;
  if (raw.externalId) score += 15;
  if (raw.imageUrl) score += 10;
  if (raw.url) score += 10;
  score += 10;
  return score;
}
