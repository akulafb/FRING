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
import { pickAssistantWalletSearchRecord } from "@/lib/wallet/assistant-record-shape";
import { enrichWalletRecordRow } from "@/lib/wallet/record-times";
import { walletFetchRecordPages, walletFetchRecordPagesPayeeOrNote } from "@/lib/wallet/records";
import { walletGetJson } from "@/lib/wallet/request";

const walletDatePresetSchema = z.enum(["today", "yesterday", "last_7_days"]);

/** Search-only caps: keep LLM payloads small (aggregate uses shared fetch defaults). */
const WALLET_SEARCH_DEFAULT_MAX_ROWS = 200;
const WALLET_SEARCH_DEFAULT_MAX_PAGES = 5;
const WALLET_SEARCH_SCHEMA_MAX_ROWS = 1000;

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
      "Fetch Wallet transactions (slim preview per row). Custom user text—recipients, gift wording (“birthday cake for dareen”), occasions—normally lives in the **note** field; category/subcategory classify. Use **noteContains** + categoryContains for that; **payeeContains** suits merchants/shops; **merchantOrMemoContains** if the phrase might be payee or note. Prefer wallet_aggregate_spend for sums with the same filters. wallet_get_record for full row. Defaults ~200 rows; max 1000. datePreset overrides start/end.",
    inputSchema: z
      .object({
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
        payeeContains: z
          .string()
          .optional()
          .describe(
            "Substring in Wallet payee/merchant (e.g. store). Not the main field for user-written captions or recipient names—that is usually noteContains.",
          ),
        noteContains: z
          .string()
          .optional()
          .describe(
            "Substring in Wallet **note** — primary filter for bespoke text such as recipients, gifts, occasions. Pair with categoryContains when relevant.",
          ),
        merchantOrMemoContains: z
          .string()
          .optional()
          .describe(
            "Match payee OR note (union, deduped). Use when wording might be in merchant or note; if it is clearly user caption text, prefer noteContains. Mutually exclusive with payeeContains and noteContains.",
          ),
        maxPages: z.number().int().min(1).max(35).optional(),
        maxRows: z.number().int().min(1).max(WALLET_SEARCH_SCHEMA_MAX_ROWS).optional(),
      })
      .superRefine((val, ctx) => {
        const mem = val.merchantOrMemoContains?.trim();
        if (mem && (val.payeeContains || val.noteContains)) {
          ctx.addIssue({
            code: "custom",
            path: ["merchantOrMemoContains"],
            message:
              "Use merchantOrMemoContains alone for payee-or-note matching, or payeeContains / noteContains — not both.",
          });
        }
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
        if (input.accountId) {
          qs.append("accountId", `eq.${input.accountId}`);
        }

        const fetchOpts = {
          maxPages: input.maxPages ?? WALLET_SEARCH_DEFAULT_MAX_PAGES,
          maxRows: input.maxRows ?? WALLET_SEARCH_DEFAULT_MAX_ROWS,
        };

        let rows: Record<string, unknown>[];
        let pages: number;
        let truncated: boolean;

        if (input.merchantOrMemoContains?.trim()) {
          const r = await walletFetchRecordPagesPayeeOrNote(
            qs,
            input.merchantOrMemoContains.trim(),
            fetchOpts,
          );
          rows = r.rows;
          pages = r.pages;
          truncated = r.truncated;
        } else {
          if (input.payeeContains) {
            qs.append("payee", `contains-i.${input.payeeContains}`);
          }
          if (input.noteContains) {
            qs.append("note", `contains-i.${input.noteContains}`);
          }
          const r = await walletFetchRecordPages(qs, fetchOpts);
          rows = r.rows;
          pages = r.pages;
          truncated = r.truncated;
        }

        const records = rows.map((row) =>
          pickAssistantWalletSearchRecord(
            row as Record<string, unknown>,
            calendar,
          ),
        );

        return {
          ok: true as const,
          displayTimeZone: calendar.timeZone,
          timeInstruction:
            "Each row is a preview (__walletSearchPreview). For Wallet-native fields beyond this shape, call wallet_get_record(id). Quote times via recordDateForUser.lineForAssistant (includes zone + UTC offset).",
          totalReturned: records.length,
          pages,
          truncated,
          ...(truncated
            ? {
                truncationWarning:
                  "Fewer rows than may exist in Wallet for this filter — widen maxRows/maxPages, narrow dates, or split into multiple queries.",
              }
            : {}),
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
      "Aggregation by category, month (YYYY-MM), or account. User-written personalization (gift for X, captions) typically lives in **note** → use noteContains + categoryContains for totals like “gifts for dareen”; payeeContains mainly for merchants. merchantOrMemoContains if ambiguous. Respect truncated.",
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
        payeeContains: z
          .string()
          .optional()
          .describe(
            "Payee/vendor substring—not the default for recipient-oriented text in entries (see noteContains).",
          ),
        noteContains: z
          .string()
          .optional()
          .describe(
            "Note-field substring — default for captions, recipients, occasions (paired with categoryContains).",
          ),
        merchantOrMemoContains: z
          .string()
          .optional()
          .describe(
            "Payee OR note union; prefer noteContains for clearly user-entered captions. Mutually exclusive with payeeContains and noteContains.",
          ),
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
      })
      .superRefine((val, ctx) => {
        const mem = val.merchantOrMemoContains?.trim();
        if (mem && (val.payeeContains || val.noteContains)) {
          ctx.addIssue({
            code: "custom",
            path: ["merchantOrMemoContains"],
            message:
              "Use merchantOrMemoContains alone for payee-or-note matching, or payeeContains / noteContains — not both.",
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

        const fetchOptsAgg = {
          maxPages: input.maxPages,
          maxRows: input.maxRows,
        };

        let rows: Record<string, unknown>[];
        let pages: number;
        let truncated: boolean;

        if (input.merchantOrMemoContains?.trim()) {
          const r = await walletFetchRecordPagesPayeeOrNote(
            qs,
            input.merchantOrMemoContains.trim(),
            fetchOptsAgg,
          );
          rows = r.rows;
          pages = r.pages;
          truncated = r.truncated;
        } else {
          if (input.payeeContains) {
            qs.append("payee", `contains-i.${input.payeeContains}`);
          }
          if (input.noteContains) {
            qs.append("note", `contains-i.${input.noteContains}`);
          }
          const r = await walletFetchRecordPages(qs, fetchOptsAgg);
          rows = r.rows;
          pages = r.pages;
          truncated = r.truncated;
        }

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
          ...(truncated
            ? {
                truncationWarning:
                  "Row/page cap stopped early — summed rows may omit some matching transactions (e.g. many gifts in-range). Narrow the question, add merchantOrMemoContains + categoryContains, or raise maxRows/maxPages.",
              }
            : {}),
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
