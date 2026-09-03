"use client";

import { useMemo } from "react";
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapSeparator,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
  type HeatmapColumn,
  HEATMAP_WEEKS_ONE_YEAR,
  resolveHeatmapWeekRange,
} from "@/components/charts/heatmap";
import { formatNumber } from "@/lib/format";

type HeatmapDay = {
  date: number;
  count: number;
  running: number;
  workers: string[];
};

type WorkerHeatmap = {
  rangeStart: number;
  days: HeatmapDay[];
  totals: { runs: number; daysActive: number; runningNow: number };
};

function dayKey(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function buildColumns(
  byDay: Map<number, HeatmapDay>,
  today = new Date(),
): HeatmapColumn[] {
  const { startDate, weekCount } = resolveHeatmapWeekRange(
    today,
    HEATMAP_WEEKS_ONE_YEAR,
  );
  const columns: HeatmapColumn[] = [];

  for (let w = 0; w < weekCount; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const bins = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + d);
      date.setHours(0, 0, 0, 0);
      const agg = byDay.get(date.getTime());
      bins.push({
        bin: d,
        count: agg?.count ?? 0,
        date,
      });
    }
    columns.push({ bin: w, bins });
  }

  return columns;
}

export function WorkerHeatmapChart({
  data,
}: {
  data: WorkerHeatmap | undefined;
}) {
  const byDay = useMemo(() => {
    const map = new Map<number, HeatmapDay>();
    for (const day of data?.days ?? []) {
      map.set(dayKey(day.date), day);
    }
    return map;
  }, [data?.days]);

  const chartData = useMemo(() => buildColumns(byDay), [byDay]);
  const status = data === undefined ? "loading" : "ready";

  return (
    <div className="rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-5 pb-4 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            Atividade da frota (12 meses)
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--ds-color-muted-foreground)]">
            Runs por dia · tooltip lista workers e quantidade
          </p>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-4 text-right">
            <div>
              <p className="ds-label-caps">Runs · período</p>
              <p className="font-mono text-[15px] font-medium">
                {formatNumber(data.totals.runs)}
              </p>
            </div>
            <div>
              <p className="ds-label-caps">Dias com run</p>
              <p className="font-mono text-[15px] font-medium">
                {formatNumber(data.totals.daysActive)}
              </p>
            </div>
            <div>
              <p className="ds-label-caps">Rodando agora</p>
              <p className="font-mono text-[15px] font-medium">
                {formatNumber(data.totals.runningNow)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-w-0 overflow-x-auto">
        <HeatmapInteractionProvider>
          <HeatmapInteractionBoundary>
            <HeatmapChart
              data={chartData}
              gap={3}
              layout="fluid"
              status={status}
              loadingLabel="Carregando atividade…"
              weekStartDay={0}
            >
              <HeatmapCells
                cornerRadius={999}
                inactiveOpacity={0.8}
                inactiveScale={0.94}
              />
              <HeatmapSeparator
                groupBy="quarter"
                showLabels
                labelClassName="text-[var(--chart-3)]"
                spacing={12}
                startOffset={14}
                strokeOpacity={0.6}
              />
              <HeatmapXAxis />
              <HeatmapYAxis tickFilter="all" labelFormat="initial" />
              <HeatmapTooltip
                formatLabel={(count, date) => {
                  if (!count) return "Nenhum run";
                  const day = byDay.get(dayKey(date.getTime()));
                  const workers = day?.workers ?? [];
                  const listed = workers.slice(0, 3).join(", ");
                  const more =
                    workers.length > 3 ? ` +${workers.length - 3}` : "";
                  const running = day?.running
                    ? ` · ${day.running} rodando`
                    : "";
                  const who = listed ? ` · ${listed}${more}` : "";
                  return `${count} run${count === 1 ? "" : "s"}${running}${who}`;
                }}
              />
            </HeatmapChart>
            <div className="mt-3">
              <HeatmapLegend
                align="center"
                cornerRadius={999}
                gap={3}
                inactiveOpacity={0.8}
                inactiveScale={0.94}
                lessLabel="Menos"
                moreLabel="Mais"
              />
            </div>
          </HeatmapInteractionBoundary>
        </HeatmapInteractionProvider>
      </div>
    </div>
  );
}
