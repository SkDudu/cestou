import { OpsKpi } from "@/components/admin/ops";

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return <OpsKpi label={label} value={value} foot={hint} />;
}
