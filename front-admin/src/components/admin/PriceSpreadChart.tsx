"use client";

import { useMemo } from "react";
import { curveCatmullRom } from "@visx/curve";
import { LineChart } from "@/components/charts/line-chart";
import { Line } from "@/components/charts/line";
import { Background } from "@/components/charts/background";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

type SpreadPoint = {
  date: number;
  spreadMedio: number;
  spreadMediana: number;
  multiCount: number;
};

type SpreadSeries = {
  points: SpreadPoint[];
  avg30d: number;
};

const SERIES = {
  spreadMedio: {
    key: "spreadMedio",
    label: "Spread médio",
    color: "var(--chart-1)",
  },
  spreadMediana: {
    key: "spreadMediana",
    label: "Spread mediana",
    color: "var(--chart-2)",
  },
} as const;

export function PriceSpreadChart({
  data,
}: {
  data: SpreadSeries | undefined;
}) {
  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        date: new Date(p.date),
        spreadMedio: p.spreadMedio,
        spreadMediana: p.spreadMediana,
      })),
    [data?.points],
  );

  const status = data === undefined ? "loading" : "ready";

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-3 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            Spread médio (30 dias)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Canônicos multi-mercado · % diário
          </p>
        </div>
        {data ? (
          <div className="text-right">
            <p className="ds-label-caps">Spread médio · 30 dias</p>
            <p className="font-mono text-[15px] font-medium">{data.avg30d}%</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[var(--ds-color-muted-foreground)]">
        {Object.values(SERIES).map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-1 min-w-0">
        <LineChart
          aspectRatio="4 / 1"
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 28, left: 8 }}
          status={status}
          loadingLabel="Carregando spread…"
        >
          <Background pattern="dots" opacity={0.85} />
          <Line
            curve={curveCatmullRom}
            dataKey={SERIES.spreadMedio.key}
            stroke={SERIES.spreadMedio.color}
            fadeEdges
            strokeWidth={2}
          />
          <Line
            curve={curveCatmullRom}
            dataKey={SERIES.spreadMediana.key}
            stroke={SERIES.spreadMediana.color}
            fadeEdges
            strokeWidth={2}
          />
          <XAxis />
          <ChartTooltip
            rows={(point) =>
              Object.values(SERIES).map((s) => ({
                label: s.label,
                value: `${Number(point[s.key] ?? 0)}%`,
                color: s.color,
              }))
            }
          />
        </LineChart>
      </div>
    </div>
  );
}
