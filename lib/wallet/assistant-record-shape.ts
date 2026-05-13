import type { CalendarSnapshot } from "@/lib/date-context";
import {
  coerceDisplayLabel,
  extractRecordAmount,
} from "@/lib/wallet/aggregate";
import { formatWalletTimestampForUser } from "@/lib/wallet/record-times";

const ASSISTANT_NOTE_MAX = 320;

/** Token-oriented preview shape for wallet_search_records (omit raw Wallet blobs). */

export function pickAssistantWalletSearchRecord(
  row: Record<string, unknown>,
  calendar: CalendarSnapshot,
): Record<string, unknown> {
  const idRaw = row.id ?? row.recordId ?? row.uuid;
  const id =
    typeof idRaw === "string"
      ? idRaw
      : idRaw !== undefined && idRaw !== null
        ? String(idRaw)
        : "";

  const amt = extractRecordAmount(row).toNumber();

  const payeeHint =
    row.payee ?? row.Payee ?? row.payeeName ?? row.merchant;
  const payeeLabel = coerceDisplayLabel(payeeHint, "");

  const categoryBlob =
    row.category ??
    row.Category ??
    row.categoryId ??
    row.categoryRef ??
    row.categoryName ??
    row.categoryObject;
  const categoryLabel = coerceDisplayLabel(categoryBlob, "(uncategorized)");

  const accountBlob =
    row.account ??
    row.Account ??
    row.accountInfo ??
    row.accountSnapshot ??
    row.accountRef;
  const accountIdRaw =
    (typeof accountBlob === "object" &&
    accountBlob !== null &&
    "id" in accountBlob
      ? (accountBlob as { id?: unknown }).id
      : undefined) ??
    row.accountId ??
    row.account_id;
  const accountId =
    accountIdRaw !== undefined && accountIdRaw !== null
      ? String(accountIdRaw)
      : undefined;
  const accountLabel = coerceDisplayLabel(
    accountBlob,
    accountId ?? "(unknown account)",
  );

  const currencyRaw =
    row.currency ?? row.currencyCode ?? row.Currency ?? row.currencyIso;
  const currencyLabel =
    coerceDisplayLabel(currencyRaw, "").trim() || undefined;

  let noteRaw = row.note ?? row.Note ?? row.description ?? row.Description;
  if (typeof noteRaw !== "string") {
    noteRaw = coerceDisplayLabel(noteRaw, "");
  }
  const noteTrimmed =
    typeof noteRaw === "string" && noteRaw.length > ASSISTANT_NOTE_MAX
      ? `${noteRaw.slice(0, ASSISTANT_NOTE_MAX)}…`
      : (noteRaw ?? "");

  const rd = formatWalletTimestampForUser(row.recordDate, calendar);

  const out: Record<string, unknown> = {
    __walletSearchPreview: true,
    note: noteTrimmed,
    id,
    amount: amt,
    payeeLabel,
    categoryLabel,
    accountLabel,
    ...(accountId ? { accountId } : {}),
    ...(currencyLabel ? { currency: currencyLabel } : {}),
  };

  if (rd) {
    out.recordDateForUser = {
      lineForAssistant: rd.lineForAssistant,
      localCalendarDate: rd.localCalendarDate,
      weekdayShort: rd.weekdayShort,
    };
  }

  const recordIso =
    typeof row.recordDate === "string" ? row.recordDate.trim() : undefined;
  if (recordIso) {
    out.recordDate = recordIso;
  }

  const typeHint = row.recordType ?? row.type ?? row.transactionType;
  if (
    typeof typeHint === "string" ||
    typeof typeHint === "number" ||
    typeof typeHint === "boolean"
  ) {
    out.recordTypeHint = String(typeHint);
  }

  return out;
}
