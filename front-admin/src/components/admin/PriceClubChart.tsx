"use client";

import { useMemo } from "react";
import { curveMonotoneX } from "@visx/curve";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { formatCurrency } from "@/lib/format";

type ClubPoint = {
  date: number;
  publico: number;
  clube: number;
  clubSamples: number;
  publicSamples: number;
};

type ClubSeries = {
  points: ClubPoint[];
  avgPublico30d: number;
  avgClube30d: number;
};

const SERIES = {
  publico: {
    key: "publico",
    label: "Preço público",
    color: "var(--chart-line-primary)",
  },
  clube: {
    key: "clube",
    label: "Preço clube",
    color: "var(--chart-line-secondary)",
  },
} as const;

export function PriceClubChart({ data }: { data: ClubSeries | undefined }) {
  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        date: new Date(p.date),
        publico: p.publico,
        clube: p.clube,
      })),
    [data?.points],
  );

  const status = data === undefined ? "loading" : "ready";

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            Clube vs público (30 dias)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Média diária · memberPrice vs preço público
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-4 text-right">
            <div>
              <p className="ds-label-caps">Público · 30 dias</p>
              <p className="font-mono text-[15px] font-medium">
                {formatCurrency(data.avgPublico30d)}
              </p>
            </div>
            <div>
              <p className="ds-label-caps">Clube · 30 dias</p>
              <p className="font-mono text-[15px] font-medium">
                {formatCurrency(data.avgClube30d)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex gap-4 text-[12px] text-[var(--ds-color-muted-foreground)]">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SERIES.publico.color }}
          />
          {SERIES.publico.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SERIES.clube.color }}
          />
          {SERIES.clube.label}
        </span>
      </div>

      <div className="mt-1 min-w-0">
        <AreaChart
          aspectRatio="4 / 1"
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 28, left: 8 }}
          status={status}
          loadingLabel="Carregando clube vs público…"
        >
          <Grid horizontal />
          <Area
            curve={curveMonotoneX}
            dataKey={SERIES.publico.key}
            fill={SERIES.publico.color}
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Area
            curve={curveMonotoneX}
            dataKey={SERIES.clube.key}
            fill={SERIES.clube.color}
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                label: SERIES.publico.label,
                value: formatCurrency(Number(point.publico ?? 0)),
                color: SERIES.publico.color,
              },
              {
                label: SERIES.clube.label,
                value: formatCurrency(Number(point.clube ?? 0)),
                color: SERIES.clube.color,
              },
            ]}
          />
        </AreaChart>
      </div>
    </div>
  );
}
