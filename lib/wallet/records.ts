import "server-only";

import { walletGetJson } from "@/lib/wallet/request";

export type RecordsEnvelope = {
  records?: Record<string, unknown>[];
  nextOffset?: number | string;
  [key: string]: unknown;
};

function parseNextOffset(env: RecordsEnvelope): number | undefined {
  const nextRaw = env.nextOffset;
  if (typeof nextRaw === "number" && Number.isFinite(nextRaw)) {
    return nextRaw;
  }
  if (typeof nextRaw === "string" && nextRaw.trim() !== "") {
    const n = Number(nextRaw);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

/**
 * Page through /v1/api/records (limit capped at 100 by Wallet rules).
 * `baseSearch` may include repeated keys (e.g. recordDate gte + lte).
 */
export async function walletFetchRecordPages(
  baseSearch: URLSearchParams,
  opts: { maxPages?: number; maxRows?: number }
): Promise<{ rows: Record<string, unknown>[]; pages: number; truncated: boolean }> {
  const maxPages = Math.min(Math.max(opts.maxPages ?? 15, 1), 40);
  const maxRows = Math.min(Math.max(opts.maxRows ?? 3000, 1), 4000);

  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  let pages = 0;
  let truncated = false;

  while (pages < maxPages && rows.length < maxRows) {
    const pageSize = Math.min(100, maxRows - rows.length);
    const search = new URLSearchParams(baseSearch);
    search.set("limit", String(pageSize));
    search.set("offset", String(offset));

    const json = (await walletGetJson("/v1/api/records", search, {
      skipCache: true,
    })) as RecordsEnvelope;

    const batchRaw = json.records;
    const batch = Array.isArray(batchRaw) ? batchRaw : [];
    pages += 1;

    for (const r of batch) {
      if (typeof r === "object" && r !== null) {
        rows.push(r as Record<string, unknown>);
      }
    }

    if (batch.length === 0) {
      break;
    }

    const fullPage = batch.length === pageSize;

    const stopForCap = rows.length >= maxRows || pages >= maxPages;

    if (stopForCap && fullPage) {
      truncated = true;
      break;
    }

    if (!fullPage) {
      break;
    }

    const next = parseNextOffset(json);
    offset = next !== undefined ? next : offset + batch.length;
  }

  return { rows, pages, truncated };
}
