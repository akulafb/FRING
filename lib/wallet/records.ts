import "server-only";

import { walletGetJson } from "@/lib/wallet/request";

export type RecordsEnvelope = {
  records?: Record<string, unknown>[];
  nextOffset?: number | string;
  [key: string]: unknown;
};

/** Stable Wallet record id for de-duplicating merged queries. */
export function walletRecordStableId(row: Record<string, unknown>): string | null {
  const id =
    row.id ??
    row.recordId ??
    row.uuid ??
    row.transactionId ??
    row.transaction_id;
  if (typeof id === "string") {
    return id.trim() || null;
  }
  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }
  return null;
}

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

/**
 * Fetch records matching `merchantOrMemoContains` in **either** payee or note,
 * merging by record id so lines that spell a name only in memo (or only in payee) both count once.
 *
 * Runs two capped paginations in parallel — if either hits `truncated`, the merged result does too.
 */
export async function walletFetchRecordPagesPayeeOrNote(
  baseSearch: URLSearchParams,
  needle: string,
  opts: { maxPages?: number; maxRows?: number }
): Promise<{ rows: Record<string, unknown>[]; pages: number; truncated: boolean }> {
  const qPayee = new URLSearchParams(baseSearch);
  qPayee.append("payee", `contains-i.${needle}`);
  const qNote = new URLSearchParams(baseSearch);
  qNote.append("note", `contains-i.${needle}`);

  const [viaPayee, viaNote] = await Promise.all([
    walletFetchRecordPages(qPayee, opts),
    walletFetchRecordPages(qNote, opts),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of viaPayee.rows) {
    const k = walletRecordStableId(r);
    if (k) {
      byId.set(k, r);
    }
  }
  for (const r of viaNote.rows) {
    const k = walletRecordStableId(r);
    if (k && !byId.has(k)) {
      byId.set(k, r);
    }
  }

  return {
    rows: [...byId.values()],
    pages: viaPayee.pages + viaNote.pages,
    truncated: viaPayee.truncated || viaNote.truncated,
  };
}
