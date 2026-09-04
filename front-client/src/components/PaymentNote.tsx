import { formatInstallment } from "@/lib/format";

export function PaymentNote({
  installmentCount,
  installmentAmount,
  installmentInterestFree,
}: {
  installmentCount?: number | null;
  installmentAmount?: number | null;
  installmentInterestFree?: boolean | null;
}) {
  const text = formatInstallment({
    installmentCount,
    installmentAmount,
    installmentInterestFree,
  });
  if (!text) return null;
  return (
    <p className="mt-0.5 text-[11px] text-[var(--ds-color-muted-foreground)]">
      {text}
    </p>
  );
}
