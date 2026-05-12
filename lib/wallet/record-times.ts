import { DateTime } from "luxon";

import type { CalendarSnapshot } from "@/lib/date-context";

/**
 * Stable, assistant-facing copy for a Wallet instant in the user's chat calendar zone.
 * Wallet emits ISO timestamps (usually Z/UTC); we never ask the model to convert by hand.
 */
export type RecordDateForUser = {
  timeZoneIANA: string;
  /** e.g. +04:00 */
  timeZoneOffset: string;
  utcIso: string;
  localCalendarDate: string;
  localTime12h: string;
  localTime24h: string;
  weekdayShort: string;
  /** Prefer this verbatim when quoting an expense time (includes zone). */
  lineForAssistant: string;
};

export function formatWalletTimestampForUser(
  isoOrUnknown: unknown,
  calendar: CalendarSnapshot,
): RecordDateForUser | null {
  if (typeof isoOrUnknown !== "string") {
    return null;
  }
  const raw = isoOrUnknown.trim();
  if (!raw) {
    return null;
  }

  let dt = DateTime.fromISO(raw, { setZone: true });
  if (!dt.isValid) {
    dt = DateTime.fromISO(raw);
  }
  if (!dt.isValid) {
    return null;
  }

  const utcIso =
    dt.toUTC().toISO({ suppressMilliseconds: true }) ??
    dt.toUTC().toISO() ??
    raw;
  const local = dt.setZone(calendar.timeZone);
  if (!local.isValid) {
    return null;
  }

  const offset = local.toFormat("ZZ");
  const localCal = local.toISODate()!;
  const localTime12h = local.toFormat("h:mm a");
  const localTime24h = local.toFormat("HH:mm");

  const lineForAssistant = `${localTime12h}, ${localCal} — ${calendar.timeZone} (UTC${offset}); Wallet UTC: ${utcIso}`;

  return {
    timeZoneIANA: calendar.timeZone,
    timeZoneOffset: offset,
    utcIso,
    localCalendarDate: localCal,
    localTime12h,
    localTime24h,
    weekdayShort: local.toFormat("ccc"),
    lineForAssistant,
  };
}

export function enrichWalletRecordRow(
  row: Record<string, unknown>,
  calendar: CalendarSnapshot,
): Record<string, unknown> {
  const recordDateForUser = formatWalletTimestampForUser(
    row.recordDate,
    calendar,
  );
  const out = { ...row };
  if (recordDateForUser) {
    out.recordDateForUser = recordDateForUser;
  }
  return out;
}
