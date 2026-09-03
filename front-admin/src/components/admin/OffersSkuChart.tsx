"use client";

import { useMemo } from "react";
import { curveMonotoneX } from "@visx/curve";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { Background } from "@/components/charts/background";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { formatNumber } from "@/lib/format";

type MarketSeries = {
  key: string;
  name: string;
  color: string;
  total: number;
};

type SkuTimeseries = {
  days: number;
  markets: MarketSeries[];
  points: Array<Record<string, number>>;
  totals: { skus: number; markets: number };
};

export function OffersSkuChart({
  data,
}: {
  data: SkuTimeseries | undefined;
}) {
  const markets = data?.markets ?? [];

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        ...p,
        date: new Date(p.date),
      })),
    [data?.points],
  );

  const status = data === undefined ? "loading" : "ready";
  const hasSeries = markets.length > 0;

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            SKUs por supermercado ({data?.days ?? 30} dias)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Ofertas criadas por dia · uma linha por rede
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-4 text-right">
            <div>
              <p className="ds-label-caps">Volume · período</p>
              <p className="font-mono text-[15px] font-medium">
                {formatNumber(data.totals.skus)}
              </p>
            </div>
            <div>
              <p className="ds-label-caps">Redes</p>
              <p className="font-mono text-[15px] font-medium">
                {data.totals.markets}
              </p>
            </div>
          </div>
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
              <span className="font-mono text-[11px] opacity-70">
                {formatNumber(m.total)}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-1 min-w-0">
        {!hasSeries && status === "ready" ? (
          <p className="py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Sem ofertas no período.
          </p>
        ) : (
          <LineChart
            aspectRatio="4 / 1"
            data={chartData}
            margin={{ top: 12, right: 12, bottom: 28, left: 8 }}
            status={status}
            loadingLabel="Carregando SKUs por rede…"
          >
            <Background pattern="dots" opacity={0.85} />
            {markets.map((m, i) => (
              <Line
                key={m.key}
                curve={curveMonotoneX}
                dataKey={m.key}
                stroke={m.color}
                fadeEdges
                strokeWidth={i === 0 ? 2.5 : 2}
              />
            ))}
            <XAxis />
            <ChartTooltip
              rows={(point) =>
                markets
                  .filter((m) => point[m.key] != null)
                  .map((m) => ({
                    label: m.name,
                    value: formatNumber(Number(point[m.key] ?? 0)),
                    color: m.color,
                  }))
              }
            />
          </LineChart>
        )}
      </div>
    </div>
  );
}
