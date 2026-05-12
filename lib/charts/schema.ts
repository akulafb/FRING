import { z } from "zod";

export const chartPayloadSchema = z.object({
  chartKind: z.enum(["bar", "line", "area", "scatter"]),
  title: z.string().min(1).max(120),
  /** Field name in each datum for the X axis (often a month or label). */
  xKey: z.string().min(1).max(64),
  /** One or more numeric columns to plot against X. */
  yKeys: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        label: z.string().min(1).max(64),
        color: z.string().max(32).optional(),
      })
    )
    .min(1)
    .max(8),
  data: z
    .array(
      z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
      )
    )
    .min(1)
    .max(200),
  xAxisLabel: z.string().max(80).optional(),
  yAxisLabel: z.string().max(80).optional(),
});

export type ChartPayload = z.infer<typeof chartPayloadSchema>;
