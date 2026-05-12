"use client";

import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

import { ChartPanel } from "@/components/fring/chart-panel";
import { MarkdownContent } from "@/components/fring/markdown-content";
import { cn } from "@/lib/utils";
import { chartPayloadSchema, type ChartPayload } from "@/lib/charts/schema";

function truncateJson(payload: unknown, max = 12_000): string {
  const s =
    typeof payload === "object"
      ? JSON.stringify(payload, null, 2)
      : String(payload);
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n… (truncated)`;
}

function tryChartFromToolOutput(output: unknown): ChartPayload | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const o = output as { ok?: unknown; chart?: unknown };
  if (o.ok === true && o.chart) {
    const parsed = chartPayloadSchema.safeParse(o.chart);
    return parsed.success ? parsed.data : null;
  }
  const direct = chartPayloadSchema.safeParse(output);
  return direct.success ? direct.data : null;
}

function toolLabel(part: ToolUIPart | DynamicToolUIPart): string {
  return part.type === "dynamic-tool" ? part.toolName : getToolName(part);
}

function ToolPartBlock({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = toolLabel(part);
  const heading = `${name} · ${part.state}`;

  if (part.state === "output-available") {
    const chart = tryChartFromToolOutput(part.output);
    if (chart && name === "fring_present_chart") {
      return (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Chart
          </p>
          <ChartPanel payload={chart} />
        </div>
      );
    }

    return (
      <details className="group/details mt-3 overflow-hidden rounded-xl border border-border bg-muted/35 text-left">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <span>{heading}</span>
          <span className="shrink-0 text-muted-foreground group-open/details:rotate-0">▾</span>
        </summary>
        <pre className="max-h-[min(70vh,28rem)] max-w-full overflow-auto border-t border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {truncateJson(part.output)}
        </pre>
      </details>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <p className="font-medium">{heading}</p>
        <p className="mt-1 whitespace-pre-wrap opacity-95">
          {part.errorText}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
      {heading}
    </div>
  );
}

export function FringMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "flex w-full gap-3 pt-2",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {!isUser ? (
        <div
          aria-hidden
          className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted font-heading text-xs font-semibold tracking-tight text-muted-foreground sm:flex"
        >
          F
        </div>
      ) : null}

      <div
        className={cn(
          "min-w-0 shrink",
          isUser ? "max-w-[min(100%,28rem)]" : "max-w-[min(100%,44rem)]",
        )}
      >
        <div
          className={cn(
            "rounded-2xl border px-4 py-3.5 shadow-sm",
            isUser
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card",
          )}
        >
          <div className={cn(isUser ? "sr-only" : "mb-2.5")}>
            {!isUser ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                FRING
              </p>
            ) : (
              <p>You</p>
            )}
          </div>

          <div className="space-y-3">
            {message.parts.map((part, i) => {
              if (isTextUIPart(part)) {
                return (
                  <MarkdownContent
                    key={`t-${i}`}
                    variant={isUser ? "user" : "assistant"}
                  >
                    {part.text}
                  </MarkdownContent>
                );
              }
              if (isToolUIPart(part)) {
                return (
                  <ToolPartBlock key={part.toolCallId} part={part} />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
    </article>
  );
}
