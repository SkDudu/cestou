"use client";

import { useMemo } from "react";
import { curveMonotoneX } from "@visx/curve";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { formatCurrency } from "@/lib/format";

type SeriesMarket = {
  key: string;
  name: string;
  color: string;
};

type Series30d = {
  days: number;
  markets: SeriesMarket[];
  points: Array<Record<string, number>>;
};

function fillSeries(
  points: Array<Record<string, number>>,
  markets: SeriesMarket[],
) {
  const filled = points.map((p) => ({ ...p }));
  for (const m of markets) {
    let last: number | undefined;
    for (const p of filled) {
      const v = p[m.key];
      if (typeof v === "number") last = v;
      else if (last != null) p[m.key] = last;
    }
    let first: number | undefined;
    for (const p of filled) {
      if (typeof p[m.key] === "number") {
        first = p[m.key];
        break;
      }
    }
    if (first != null) {
      for (const p of filled) {
        if (typeof p[m.key] === "number") break;
        p[m.key] = first;
      }
    } else {
      // Sem preço real: baseline 0 (não o topo do SVG)
      for (const p of filled) p[m.key] = 0;
    }
  }
  return filled;
}

export function ProductPriceChart({
  data,
}: {
  data: Series30d | undefined;
}) {
  const markets = data?.markets ?? [];

  const { chartData, yMax } = useMemo(() => {
    const series = data?.markets ?? [];
    const filled = fillSeries(data?.points ?? [], series);
    let max = 0;
    for (const p of filled) {
      for (const m of series) {
        const v = p[m.key];
        if (typeof v === "number" && v > max) max = v;
      }
    }
    return {
      chartData: filled.map((p) => ({
        ...p,
        date: new Date(p.date),
      })),
      yMax: max > 0 ? max : 1,
    };
  }, [data?.points, data?.markets]);

  const status = data === undefined ? "loading" : "ready";
  const hasSeries = markets.length > 0;

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            Preço por rede (30 dias)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Histórico do canônico · eixo Y desde R$ 0
          </p>
        </div>
        {hasSeries ? (
          <p className="text-[12px] text-[var(--ds-color-muted-foreground)]">
            {markets.length} rede{markets.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {hasSeries ? (
        <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[var(--ds-color-muted-foreground)]">
          {markets.map((m) => (
            <span key={m.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: m.color }}
              />
              {m.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-1 min-w-0">
        {!hasSeries && status === "ready" ? (
          <p className="py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Sem priceHistory neste canônico.
          </p>
        ) : (
          <AreaChart
            aspectRatio="4 / 1"
            data={chartData}
            margin={{ top: 12, right: 12, bottom: 28, left: 8 }}
            status={status}
            loadingLabel="Carregando preços por rede…"
            yScaleDomainMax={yMax}
          >
            <Grid horizontal />
            {markets.map((m, i) => (
              <Area
                key={m.key}
                curve={curveMonotoneX}
                dataKey={m.key}
                fill={m.color}
                stroke={m.color}
                fillOpacity={i === 0 ? 0.3 : 0.15}
                strokeWidth={i === 0 ? 2 : 1.5}
              />
            ))}
            <XAxis />
            <ChartTooltip
              rows={(point) =>
                markets
                  .filter((m) => point[m.key] != null)
                  .map((m) => ({
                    label: m.name,
                    value: formatCurrency(Number(point[m.key])),
                    color: m.color,
                  }))
              }
            />
          </AreaChart>
        )}
      </div>
    </div>
  );
}
