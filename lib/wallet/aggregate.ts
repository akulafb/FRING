import "server-only";

import Decimal from "decimal.js";

export function toDecimalAmount(v: unknown): Decimal {
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Decimal(v);
  }
  if (typeof v === "string" && v.trim() !== "") {
    try {
      return new Decimal(v.trim());
    } catch {
      return new Decimal(0);
    }
  }
  return new Decimal(0);
}

/** Turn nested Wallet fields (category object, etc.) into a stable string key. */
export function coerceDisplayLabel(input: unknown, fallback: string): string {
  if (input == null || input === "") {
    return fallback;
  }
  if (typeof input === "string" || typeof input === "number") {
    return String(input);
  }
  if (typeof input === "boolean") {
    return input ? "true" : "false";
  }
  if (Array.isArray(input)) {
    const parts = input
      .map((x) => coerceDisplayLabel(x, ""))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : fallback;
  }
  if (typeof input === "object") {
    const o = input as Record<string, unknown>;
    const label =
      o.name ?? o.title ?? o.label ?? o.text ?? o.displayName ?? o.fullName;
    if (
      typeof label === "string" ||
      typeof label === "number" ||
      typeof label === "boolean"
    ) {
      return String(label);
    }
    if (typeof o.id === "string" || typeof o.id === "number") {
      return String(o.id);
    }
    if (typeof o.code === "string") {
      return o.code;
    }
  }
  return fallback;
}

/**
 * Resolve transaction amount across common Wallet REST field shapes.
 */
export function extractRecordAmount(row: Record<string, unknown>): Decimal {
  for (const key of ["amount", "baseAmount"] as const) {
    const blob = row[key];
    if (blob && typeof blob === "object" && blob !== null) {
      const v = (blob as Record<string, unknown>).value;
      const d = toDecimalAmount(v);
      if (!d.isZero()) {
        return d;
      }
    }
  }

  const candidates = [
    row.amount,
    row.Amount,
    row.value,
    row.Value,
    row.money,
    row.transferAmount,
    row.transactionAmount,
  ];

  for (const c of candidates) {
    const d = toDecimalAmount(c);
    if (!d.isZero()) {
      return d;
    }
  }

  if (typeof row.amount === "object" && row.amount !== null) {
    const o = row.amount as Record<string, unknown>;
    const inner = toDecimalAmount(o.amount ?? o.value ?? o.Value);
    if (!inner.isZero()) {
      return inner;
    }
  }

  for (const [k, val] of Object.entries(row)) {
    if (!/amount|value|money|transfer|sum/i.test(k)) {
      continue;
    }
    const d = toDecimalAmount(val);
    if (!d.isZero()) {
      return d;
    }
  }

  const nested = findNestedAmount(row, 0);
  if (nested && !nested.isZero()) {
    return nested;
  }

  return new Decimal(0);
}

const MAX_AMOUNT_DEPTH = 4;

function findNestedAmount(
  node: unknown,
  depth: number,
): Decimal | undefined {
  if (depth > MAX_AMOUNT_DEPTH || node === null || node === undefined) {
    return undefined;
  }
  if (typeof node === "number") {
    const d = new Decimal(node);
    return d.isZero() ? undefined : d;
  }
  if (typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }

  const obj = node as Record<string, unknown>;
  for (const [k, val] of Object.entries(obj)) {
    if (/^(amount|transactionAmount|money|value)$/i.test(k)) {
      const d = toDecimalAmount(val);
      if (!d.isZero()) {
        return d;
      }
    }
  }
  for (const val of Object.values(obj)) {
    const found = findNestedAmount(val, depth + 1);
    if (found && !found.isZero()) {
      return found;
    }
  }
  return undefined;
}

export type GroupBy = "category" | "month" | "account";

export function normalizeGroupKey(
  groupBy: GroupBy,
  row: Record<string, unknown>,
): string {
  switch (groupBy) {
    case "category": {
      const c =
        row.category ??
        row.Category ??
        row.categoryId ??
        row.categoryRef ??
        row.categoryName ??
        row.categoryObject;
      if (c !== undefined && c !== null) {
        return coerceDisplayLabel(c, "(uncategorized)");
      }
      return "(uncategorized)";
    }
    case "account": {
      const a =
        row.account ??
        row.Account ??
        row.accountInfo ??
        row.accountSnapshot ??
        row.accountRef ??
        row.accountId ??
        row.account_id ??
        row.accountName;
      return coerceDisplayLabel(a, "(unknown account)");
    }
    case "month": {
      const d = String(row.recordDate ?? row.date ?? row.record_date ?? "");
      if (d.length >= 7) {
        return d.slice(0, 7);
      }
      return "(no date)";
    }
    default:
      return "(unknown)";
  }
}

export function aggregateRows(
  rows: Record<string, unknown>[],
  groupBy: GroupBy,
): Array<{ key: string; total: number; count: number }> {
  const map = new Map<string, { total: Decimal; count: number }>();

  for (const row of rows) {
    const key = normalizeGroupKey(groupBy, row);
    const amt = extractRecordAmount(row);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { total: amt, count: 1 });
    } else {
      cur.total = cur.total.plus(amt);
      cur.count += 1;
    }
  }

  return [...map.entries()].map(([key, { total, count }]) => ({
    key,
    total: total.toNumber(),
    count,
  }));
}
