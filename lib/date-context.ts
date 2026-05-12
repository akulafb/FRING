import "server-only";

import { DateTime } from "luxon";

export type DatePreset = "today" | "yesterday" | "last_7_days";

/** Where calendar zone came from — browser wins over env fallback. */
export type CalendarTzSource = "client" | "env" | "utc";

export type CalendarSnapshot = {
  timeZone: string;
  source: CalendarTzSource;
  /** Server instant rendered in chosen zone — used for presets and appendix. */
  nowIso: string;
  today: string;
  yesterday: string;
  last7Days: { start: string; end: string };
};

function envTimezoneCandidate(): string | undefined {
  const tz = process.env.FRING_USER_TIMEZONE?.trim();
  if (tz?.length) {
    return tz;
  }
  return undefined;
}

export function isLikelyValidTimeZoneId(zone: string): boolean {
  const z = zone.trim();
  return z.length > 0 && DateTime.now().setZone(z).isValid;
}

/**
 * Validates + normalizes a browser-supplied TZ id (opaque string merged into POST body).
 */
export function sanitizeIncomingClientTimezone(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().slice(0, 128);
  if (!trimmed) {
    return undefined;
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return undefined;
  }
  if (!isLikelyValidTimeZoneId(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/**
 * Prefer TZ from `/api/chat` body (`Intl` zone from the browser);
 * fallback `FRING_USER_TIMEZONE`; then UTC.
 */
export function resolveCalendarTimeZone(
  clientFromRequest?: string | null,
): { timeZone: string; source: CalendarTzSource } {
  const c = clientFromRequest?.trim();
  if (c && isLikelyValidTimeZoneId(c)) {
    return { timeZone: c, source: "client" };
  }
  const env = envTimezoneCandidate();
  if (env && isLikelyValidTimeZoneId(env)) {
    return { timeZone: env, source: "env" };
  }
  return { timeZone: "UTC", source: "utc" };
}

export function buildCalendarSnapshot(
  zone: string,
  source: CalendarTzSource,
): CalendarSnapshot {
  let timeZone = zone.trim();
  let now = DateTime.now().setZone(timeZone);
  let src = source;
  if (!now.isValid) {
    timeZone = "UTC";
    now = DateTime.now().setZone(timeZone);
    src = "utc";
  }
  const today = now.toISODate()!;
  const yesterday = now.minus({ days: 1 }).toISODate()!;
  const weekStart = now.minus({ days: 6 }).toISODate()!;
  return {
    timeZone,
    source: src,
    nowIso: now.toISO()!,
    today,
    yesterday,
    last7Days: { start: weekStart, end: today },
  };
}

/** No browser hints — env / UTC fallback (e.g. system prompt without an HTTP request). */
export function fallbackCalendarSnapshot(): CalendarSnapshot {
  const r = resolveCalendarTimeZone(undefined);
  return buildCalendarSnapshot(r.timeZone, r.source);
}

export function resolveDateRangeFromSnapshot(
  snapshot: CalendarSnapshot,
  input: {
    startDate?: string;
    endDate?: string;
    datePreset?: DatePreset;
  },
): {
  startDate: string;
  endDate: string;
  resolvedFromPreset?: DatePreset;
} {
  if (input.datePreset === "today") {
    return {
      startDate: snapshot.today,
      endDate: snapshot.today,
      resolvedFromPreset: "today",
    };
  }
  if (input.datePreset === "yesterday") {
    return {
      startDate: snapshot.yesterday,
      endDate: snapshot.yesterday,
      resolvedFromPreset: "yesterday",
    };
  }
  if (input.datePreset === "last_7_days") {
    return {
      startDate: snapshot.last7Days.start,
      endDate: snapshot.last7Days.end,
      resolvedFromPreset: "last_7_days",
    };
  }
  if (!input.startDate || !input.endDate) {
    throw new Error(
      "Provide datePreset (today | yesterday | last_7_days) or both startDate and endDate (YYYY-MM-DD).",
    );
  }
  return { startDate: input.startDate, endDate: input.endDate };
}

export function resolveOptionalSearchDatesFromSnapshot(
  snapshot: CalendarSnapshot,
  input: {
    startDate?: string;
    endDate?: string;
    datePreset?: DatePreset;
  },
): {
  startDate?: string;
  endDate?: string;
  resolvedFromPreset?: DatePreset;
} {
  if (input.datePreset) {
    const r = resolveDateRangeFromSnapshot(snapshot, {
      datePreset: input.datePreset,
    });
    return {
      startDate: r.startDate,
      endDate: r.endDate,
      resolvedFromPreset: r.resolvedFromPreset,
    };
  }
  if (input.startDate && input.endDate) {
    return { startDate: input.startDate, endDate: input.endDate };
  }
  return {};
}

/** Appended so the model never guesses “today”. */
export function fringCalendarSystemAppendixForSnapshot(c: CalendarSnapshot): string {
  const sourceExplain =
    c.source === "client"
      ? "detected automatically from your browser (Intl timezone)"
      : c.source === "env"
        ? "from FRING_USER_TIMEZONE (browser hint missing — e.g. non-browser API call)"
        : "default UTC";
  return [
    "Calendar context (computed on this server — use exactly these YYYY-MM-DD values for Wallet date filters):",
    `- Time zone: ${c.timeZone} (${sourceExplain})`,
    `- Today's date: ${c.today}`,
    `- Yesterday's date: ${c.yesterday}`,
    `- Last 7 calendar days inclusive: ${c.last7Days.start} … ${c.last7Days.end}`,
    `- Instant reference (ISO, in that zone): ${c.nowIso}`,
    'Prefer tool parameter datePreset `"today"` (or `"yesterday"` | `"last_7_days"`) instead of guessing startDate/endDate year.',
    "When answering in natural language, say “today”, “yesterday”, or name the preset range — aligned with these dates.",
  ].join("\n");
}
