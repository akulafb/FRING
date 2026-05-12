"use client";

import type { ChartPayload } from "@/lib/charts/schema";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function normalizeDatum(
  row: Record<string, string | number | boolean | null>,
  xKey: string,
  yKeys: ChartPayload["yKeys"]
): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  const xVal = row[xKey];
  if (typeof xVal === "number" || typeof xVal === "string") {
    out[xKey] =
      typeof xVal === "number" && Number.isFinite(xVal)
        ? xVal
        : String(xVal);
  } else if (typeof xVal === "boolean") {
    out[xKey] = xVal ? 1 : 0;
  } else {
    out[xKey] = "";
  }

  for (const { key } of yKeys) {
    const raw = row[key];
    let n =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number.parseFloat(typeof raw === "string" ? raw : "");

    if (!Number.isFinite(n)) {
      n = 0;
    }
    out[key] = n;
  }

  return out;
}

export function ChartPanel({ payload }: { payload: ChartPayload }) {
  const data = payload.data.map((row) =>
    normalizeDatum(row as Record<string, string | number | boolean | null>, payload.xKey, payload.yKeys)
  );

  const sharedAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" className="opacity-35" />
      <XAxis
        dataKey={payload.xKey}
        name={payload.xAxisLabel ?? payload.xKey}
      />
      <YAxis name={payload.yAxisLabel ?? "value"} />
      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
    </>
  );

  return (
    <div className="mt-4 w-full space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {payload.title}
      </p>
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          {payload.chartKind === "bar" ? (
            <BarChart data={data}>
              {sharedAxes}
              {payload.yKeys.map((yk) => (
                <Bar
                  key={yk.key}
                  dataKey={yk.key}
                  fill={yk.color ?? "#6366f1"}
                  radius={[4, 4, 0, 0]}
                  name={yk.label}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          ) : null}

          {payload.chartKind === "line" ? (
            <LineChart data={data}>
              {sharedAxes}
              {payload.yKeys.map((yk) => (
                <Line
                  key={yk.key}
                  type="monotone"
                  dataKey={yk.key}
                  stroke={yk.color ?? "#6366f1"}
                  strokeWidth={2}
                  dot={false}
                  name={yk.label}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : null}

          {payload.chartKind === "area" ? (
            <AreaChart data={data}>
              {sharedAxes}
              {payload.yKeys.map((yk) => (
                <Area
                  key={yk.key}
                  type="monotone"
                  dataKey={yk.key}
                  stroke={yk.color ?? "#6366f1"}
                  fill={yk.color ?? "#6366f1"}
                  fillOpacity={0.2}
                  name={yk.label}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          ) : null}

          {payload.chartKind === "scatter" ? (() => {
            const primary = payload.yKeys[0]!;
            const scatterData = data.map((row) => ({
              x: Number(row[payload.xKey]),
              y: Number(row[primary.key]),
              label: String(row[payload.xKey]),
            }));
            return (
              <ScatterChart margin={{ top: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-35" />
                <XAxis type="number" dataKey="x" name={payload.xAxisLabel ?? payload.xKey} />
                <YAxis type="number" dataKey="y" name={payload.yAxisLabel ?? primary.label} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  name={primary.label}
                  data={scatterData}
                  fill={primary.color ?? "#6366f1"}
                  isAnimationActive={false}
                />
              </ScatterChart>
            );
          })() : null}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
