"use client";

import { useMemo } from "react";
import { curveMonotoneX } from "@visx/curve";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { formatNumber } from "@/lib/format";

type Point = {
  date: number;
  matched: number;
  unmatched: number;
};

type Timeseries = {
  days: number;
  points: Point[];
  totals: { matched: number; unmatched: number; matchRate: number };
  week: {
    matched: number;
    unmatched: number;
    prevMatched: number;
    prevUnmatched: number;
  };
};

const SERIES = {
  matched: {
    key: "matched",
    label: "Com canônico",
    color: "var(--chart-line-primary)",
  },
  unmatched: {
    key: "unmatched",
    label: "Sem match",
    color: "var(--chart-line-secondary)",
  },
} as const;

export function MatchingHealthChart({
  data,
}: {
  data: Timeseries | undefined;
}) {
  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        date: new Date(p.date),
        matched: p.matched,
        unmatched: p.unmatched,
      })),
    [data?.points],
  );

  const status = data === undefined ? "loading" : "ready";
  const weekMatchRate =
    data && data.week.matched + data.week.unmatched > 0
      ? Math.round(
          (data.week.matched /
            (data.week.matched + data.week.unmatched)) *
            1000,
        ) / 10
      : null;
  const prevWeekMatchRate =
    data && data.week.prevMatched + data.week.prevUnmatched > 0
      ? Math.round(
          (data.week.prevMatched /
            (data.week.prevMatched + data.week.prevUnmatched)) *
            1000,
        ) / 10
      : null;

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            Qualidade do matching (30 dias)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Ofertas criadas nos últimos 30 dias · com canônico vs sem match
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-4 text-right">
            <div>
              <p className="ds-label-caps">Taxa de match · 30 dias</p>
              <p className="font-mono text-[15px] font-medium">
                {data.totals.matchRate}%
              </p>
            </div>
            <div>
              <p className="ds-label-caps">7 dias vs anterior</p>
              <p className="font-mono text-[15px] font-medium">
                {weekMatchRate != null ? `${weekMatchRate}%` : "—"}
                {prevWeekMatchRate != null ? (
                  <span className="ml-1 text-[12px] font-normal text-[var(--ds-color-muted-foreground)]">
                    ← {prevWeekMatchRate}%
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="ds-label-caps">Volume · 30 dias</p>
              <p className="font-mono text-[15px] font-medium">
                {formatNumber(data.totals.matched + data.totals.unmatched)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex gap-4 text-[12px] text-[var(--ds-color-muted-foreground)]">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SERIES.matched.color }}
          />
          {SERIES.matched.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: SERIES.unmatched.color }}
          />
          {SERIES.unmatched.label}
        </span>
      </div>

      <div className="mt-1 min-w-0">
        <AreaChart
          aspectRatio="4 / 1"
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 28, left: 8 }}
          status={status}
          loadingLabel="Carregando qualidade do matching…"
        >
          <Grid horizontal />
          <Area
            curve={curveMonotoneX}
            dataKey={SERIES.matched.key}
            fill={SERIES.matched.color}
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Area
            curve={curveMonotoneX}
            dataKey={SERIES.unmatched.key}
            fill={SERIES.unmatched.color}
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                label: SERIES.matched.label,
                value: Number(point.matched ?? 0),
                color: SERIES.matched.color,
              },
              {
                label: SERIES.unmatched.label,
                value: Number(point.unmatched ?? 0),
                color: SERIES.unmatched.color,
              },
            ]}
          />
        </AreaChart>
      </div>
    </div>
  );
}
