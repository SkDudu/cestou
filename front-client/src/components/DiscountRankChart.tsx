"use client";

import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";

export type DiscountRankItem = {
  supermarketId: string;
  name: string;
  avgDiscountPct: number;
  offerCount: number;
};

function shortLabel(name: string) {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

export function DiscountRankChart({ items }: { items: DiscountRankItem[] }) {
  const data = items.map((item) => ({
    market: shortLabel(item.name),
    value: item.avgDiscountPct,
    offerCount: item.offerCount,
    fullName: item.name,
  }));

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div>
        <p className="text-[15px] font-semibold leading-5">
          Rank de descontos
        </p>
        <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
          Média de % off em ofertas vigentes · top {items.length}
        </p>
      </div>
      <div className="mt-2 min-h-[180px] min-w-0 flex-1">
        <BarChart
          aspectRatio="16 / 9"
          barGap={0.18}
          data={data}
          margin={{ top: 8, right: 8, bottom: 40, left: 8 }}
          xDataKey="market"
        >
          <Grid horizontal />
          <Bar dataKey="value" lineCap="butt" />
          <BarXAxis maxLabels={8} />
          <ChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: "var(--chart-line-primary)",
                label: "Desconto médio",
                value: `${Number(point.value).toFixed(1)}%`,
              },
              {
                color: "var(--chart-line-secondary)",
                label: "Ofertas",
                value: Number(point.offerCount ?? 0),
              },
            ]}
          />
        </BarChart>
      </div>
    </div>
  );
}
