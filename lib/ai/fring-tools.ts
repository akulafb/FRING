import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { chartPayloadSchema } from "@/lib/charts/schema";
import {
  resolveDateRangeFromSnapshot,
  resolveOptionalSearchDatesFromSnapshot,
  type CalendarSnapshot,
} from "@/lib/date-context";
import { aggregateRows, type GroupBy } from "@/lib/wallet/aggregate";
import { WalletConfigError } from "@/lib/wallet/errors";
import { enrichWalletRecordRow } from "@/lib/wallet/record-times";
import { walletFetchRecordPages } from "@/lib/wallet/records";
import { walletGetJson } from "@/lib/wallet/request";

const walletDatePresetSchema = z.enum(["today", "yesterday", "last_7_days"]);

function walletErrMessage(err: unknown): string {
  if (err instanceof WalletConfigError) {
    return err.message;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown Wallet error";
}

export function createFringWalletTools(calendar: CalendarSnapshot) {
  return {
  fring_present_chart: tool({
    description:
      "Render a chart in the UI. Only use after you have real rows from Wallet tools; pass xKey and yKeys that exist on each datum.",
    inputSchema: chartPayloadSchema,
    execute: async (input) => ({ ok: true as const, chart: input }),
  }),

  wallet_health: tool({
    description:
      "Check Wallet REST connectivity and API usage quota (lightweight GET).",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/api-usage/stats",
          new URLSearchParams(),
          { cacheTtlMs: 15_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_accounts: tool({
    description: "List Wallet accounts (balances, types, currencies).",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/accounts",
          new URLSearchParams(),
          { cacheTtlMs: 60_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_categories: tool({
    description: "List Wallet categories (tree / category metadata as returned by API).",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/categories",
          new URLSearchParams(),
          { cacheTtlMs: 120_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_budgets: tool({
    description: "List budgets and progress as returned by Wallet.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/budgets",
          new URLSearchParams(),
          { cacheTtlMs: 60_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_goals: tool({
    description: "List savings goals and progress.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson("/v1/api/goals", new URLSearchParams(), {
          cacheTtlMs: 60_000,
        });
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_standing_orders: tool({
    description: "List standing orders / recurring upcoming payments.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/standing-orders",
          new URLSearchParams(),
          { cacheTtlMs: 60_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_labels: tool({
    description: "List labels/tags used in Wallet.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson("/v1/api/labels", new URLSearchParams(), {
          cacheTtlMs: 120_000,
        });
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_list_record_rules: tool({
    description: "List Wallet auto-categorization / record automation rules.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const data = await walletGetJson(
          "/v1/api/record-rules",
          new URLSearchParams(),
          { cacheTtlMs: 120_000 }
        );
        return { ok: true as const, data };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_get_record: tool({
    description: "Fetch a single Wallet record by its id.",
    inputSchema: z.object({
      id: z.string().min(4).describe("Wallet record UUID / id."),
    }),
    execute: async ({ id }) => {
      try {
        const data = (await walletGetJson(
          "/v1/api/records/by-id",
          {
            id,
          },
          { skipCache: true },
        )) as unknown;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          return { ok: true as const, data };
        }
        const row = data as Record<string, unknown>;
        return {
          ok: true as const,
          displayTimeZone: calendar.timeZone,
          timeInstruction:
            "When stating this record's time, use recordDateForUser.lineForAssistant (includes IANA zone + UTC offset).",
          data: enrichWalletRecordRow(row, calendar),
        };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_search_records: tool({
    description:
      "Fetch raw Wallet transactions across pages (read-only). Use for line-level drill-down; prefer wallet_aggregate_spend for rollups. Prefer datePreset for “today”, “yesterday”, or last 7 days — overrides start/end when both are present.",
    inputSchema: z.object({
      datePreset: walletDatePresetSchema
        .optional()
        .describe(
          "calendar range in user's browser timezone (sent with chat) — today | yesterday | last_7_days (inclusive); overrides startDate/endDate if set.",
        ),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Inclusive lower bound recordDate"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Inclusive upper bound recordDate"),
      categoryContains: z.string().optional(),
      accountId: z.string().optional(),
      payeeContains: z.string().optional(),
      noteContains: z.string().optional(),
      maxPages: z.number().int().min(1).max(35).optional(),
      maxRows: z.number().int().min(1).max(4000).optional(),
    }),
    execute: async (input) => {
      try {
        const qs = new URLSearchParams();

        const { startDate, endDate, resolvedFromPreset } =
          resolveOptionalSearchDatesFromSnapshot(calendar, {
            datePreset: input.datePreset,
            startDate: input.startDate,
            endDate: input.endDate,
          });

        if (startDate) {
          qs.append("recordDate", `gte.${startDate}`);
        }
        if (endDate) {
          qs.append("recordDate", `lte.${endDate}`);
        }
        if (input.categoryContains) {
          qs.append("category", `contains-i.${input.categoryContains}`);
        }
        if (input.payeeContains) {
          qs.append("payee", `contains-i.${input.payeeContains}`);
        }
        if (input.noteContains) {
          qs.append("note", `contains-i.${input.noteContains}`);
        }
        if (input.accountId) {
          qs.append("accountId", `eq.${input.accountId}`);
        }

        const { rows, pages, truncated } = await walletFetchRecordPages(qs, {
          maxPages: input.maxPages,
          maxRows: input.maxRows,
        });

        const records = rows.map((row) =>
          enrichWalletRecordRow(row as Record<string, unknown>, calendar),
        );

        return {
          ok: true as const,
          displayTimeZone: calendar.timeZone,
          timeInstruction:
            "For every expense time you mention, copy from recordDateForUser.lineForAssistant (includes IANA zone + UTC offset). Do not convert from recordDate yourself — it is Wallet UTC.",
          totalReturned: records.length,
          pages,
          truncated,
          dateRangeApplied:
            startDate && endDate
              ? {
                  start: startDate,
                  end: endDate,
                  datePreset: resolvedFromPreset ?? null,
                }
              : null,
          records,
        };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),

  wallet_aggregate_spend: tool({
    description:
      "Deterministic aggregation of Wallet records by category, calendar month (YYYY-MM), or account label string. Computes totals/counts server-side. Prefer datePreset for calendar-relative ranges (same timezone rules as wallet_search_records).",
    inputSchema: z
      .object({
        datePreset: walletDatePresetSchema
          .optional()
          .describe("Overrides explicit start/end when set."),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        groupBy: z.enum(["category", "month", "account"]),
        categoryContains: z.string().optional(),
        accountId: z.string().optional(),
        maxPages: z.number().int().min(1).max(35).optional(),
        maxRows: z.number().int().min(1).max(4000).optional(),
      })
      .superRefine((val, ctx) => {
        if (val.datePreset) return;
        if (!val.startDate || !val.endDate) {
          ctx.addIssue({
            code: "custom",
            message:
              "Provide datePreset OR both startDate and endDate (YYYY-MM-DD).",
          });
        }
      }),
    execute: async (input) => {
      try {
        const { startDate, endDate, resolvedFromPreset } =
          resolveDateRangeFromSnapshot(calendar, {
            datePreset: input.datePreset,
            startDate: input.startDate,
            endDate: input.endDate,
          });

        const qs = new URLSearchParams();
        qs.append("recordDate", `gte.${startDate}`);
        qs.append("recordDate", `lte.${endDate}`);
        if (input.categoryContains) {
          qs.append("category", `contains-i.${input.categoryContains}`);
        }
        if (input.accountId) {
          qs.append("accountId", `eq.${input.accountId}`);
        }

        const { rows, pages, truncated } = await walletFetchRecordPages(qs, {
          maxPages: input.maxPages,
          maxRows: input.maxRows,
        });

        const groups = aggregateRows(rows, input.groupBy as GroupBy).sort(
          (a, b) => Math.abs(b.total) - Math.abs(a.total)
        );

        return {
          ok: true as const,
          displayTimeZone: calendar.timeZone,
          timeInstruction:
            "Rollups cover calendar-date filters in this zone only. When the user asks for times of individual expenses, call wallet_search_records and quote recordDateForUser.lineForAssistant (timezone included).",
          groupBy: input.groupBy,
          startDate,
          endDate,
          datePresetApplied: resolvedFromPreset ?? null,
          pages,
          truncated,
          rowsUsed: rows.length,
          groups,
          note:
            "Totals sum the numeric amount field from Wallet (mixed-currency accounts are not split automatically). For presentation, round whole currency units if the user prefers — ignore fussy decimal formatting unless they ask.",
        };
      } catch (e) {
        return { ok: false as const, error: walletErrMessage(e) };
      }
    },
  }),
};
}

export type FringWalletToolSet = ReturnType<typeof createFringWalletTools>;
