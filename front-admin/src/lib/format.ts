export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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
