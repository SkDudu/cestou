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
