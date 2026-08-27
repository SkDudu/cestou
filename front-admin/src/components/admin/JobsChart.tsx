"use client";

import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";

type Point = { day: number; label: string; jobs: number; flyers: number };

export function JobsChart({ points }: { points: Point[] }) {
  const data = points.map((p) => ({
    day: new Date(p.day).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
    }),
    value: p.jobs,
  }));

  return (
    <div className="flex h-full min-w-0 flex-col">
      <p className="text-[15px] font-semibold leading-5">Jobs de extração</p>
      <div className="mt-2 min-w-0 flex-1">
        <BarChart
          aspectRatio="4 / 1"
          barGap={0.1}
          data={data}
          margin={{ top: 8, right: 8, bottom: 40, left: 8 }}
          xDataKey="day"
        >
          <Grid horizontal />
          <Bar dataKey="value" lineCap="butt" />
          <BarXAxis maxLabels={8} />
          <ChartTooltip />
        </BarChart>
      </div>
    </div>
  );
}
