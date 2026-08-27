"use client";

import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import type { PieData } from "@/components/charts/pie-context";

export function ParseGauge({
  pieData,
  caption,
}: {
  pieData: PieData[];
  caption: string;
}) {
  const slices = pieData.every((item) => item.value === 0)
    ? [{ label: "Sem dados", value: 1, color: "var(--ds-color-mist)" }]
    : pieData;

  return (
    <div className="flex h-full flex-col">
      <p className="text-[15px] font-semibold leading-5">Taxa de parse</p>
      <div className="flex flex-1 flex-col items-center justify-center">
        <PieChart data={slices} innerRadius={60} size={200}>
          {slices.map((item, index) => (
            <PieSlice index={index} key={item.label} />
          ))}
          <PieCenter defaultLabel="Total" />
        </PieChart>
        <p className="mt-1 text-xs leading-4 text-[var(--ds-color-muted-foreground)]">
          {caption}
        </p>
      </div>
    </div>
  );
}
