"use client";

import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import type { PieData } from "@/components/charts/pie-context";

export function SpreadGauge({
  extremeCount,
  totalCanonical,
}: {
  extremeCount: number;
  totalCanonical: number;
}) {
  const ok = Math.max(0, totalCanonical - extremeCount);
  const pieData: PieData[] =
    totalCanonical === 0
      ? [{ label: "Sem dados", value: 1, color: "var(--ds-color-mist)" }]
      : [
          ...(extremeCount > 0
            ? [
                {
                  label: "Spread >40%",
                  value: extremeCount,
                  color: "var(--ds-color-rust)",
                },
              ]
            : []),
          ...(ok > 0
            ? [
                {
                  label: "Ok",
                  value: ok,
                  color: "var(--ds-color-harbor)",
                },
              ]
            : []),
        ];

  return (
    <div className="flex h-full flex-col">
      <p className="text-[15px] font-semibold leading-5">Spread &gt;40%</p>
      <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
        Todo o catálogo · suspeita de match errado
      </p>
      <div className="flex flex-1 flex-col items-center justify-center">
        <PieChart data={pieData} innerRadius={60} size={200}>
          {pieData.map((item, index) => (
            <PieSlice index={index} key={item.label} />
          ))}
          <PieCenter defaultLabel="Canônicos" />
        </PieChart>
        <p className="mt-1 text-xs leading-4 text-[var(--ds-color-muted-foreground)]">
          {extremeCount} de {totalCanonical} canônicos com spread extremo
        </p>
      </div>
    </div>
  );
}
