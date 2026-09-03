export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDistanceKm(km: number | null | undefined) {
  if (km == null) return "sem GPS";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatDay(ts?: number | null) {
  if (ts == null) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(ts);
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
