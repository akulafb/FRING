import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from "ai";

import { createFringWalletTools } from "@/lib/ai/fring-tools";
import { fringWalletSystemPrompt } from "@/lib/ai/system-prompt";
import { trimChatModelMessages } from "@/lib/ai/trim-chat-messages";
import {
  buildCalendarSnapshot,
  resolveCalendarTimeZone,
  sanitizeIncomingClientTimezone,
} from "@/lib/date-context";
import { createOpenRouterClient } from "@/lib/openrouter";

export const maxDuration = 120;

type ChatRequestBody = {
  /** Model messages (`content`) or UI messages (`parts`) — see README examples. */
  messages?: unknown;
  /** Browser `Intl.DateTimeFormat().resolvedOptions().timeZone` merged by `/chat`. */
  clientTimeZone?: unknown;
};

function isUiMessagePayload(
  messages: unknown[],
): messages is Omit<UIMessage, "id">[] {
  if (messages.length === 0) {
    return false;
  }

  const first = messages[0];
  return (
    typeof first === "object" &&
    first !== null &&
    "role" in first &&
    "parts" in first &&
    Array.isArray((first as { parts?: unknown }).parts)
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const messages = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "missing messages" }, { status: 400 });
    }

    const modelMessages: ModelMessage[] = isUiMessagePayload(messages)
      ? await convertToModelMessages(messages)
      : (messages as ModelMessage[]);

    const trimmedMessages = trimChatModelMessages(modelMessages);

    const clientTzSanitized = sanitizeIncomingClientTimezone(
      body.clientTimeZone,
    );

    const { timeZone: zoneId, source } =
      resolveCalendarTimeZone(clientTzSanitized);
    const calendar = buildCalendarSnapshot(zoneId, source);

    const modelId =
      process.env.OPENROUTER_MODEL ?? "google/gemini-3-flash-preview";
    const openrouter = createOpenRouterClient();

    const result = streamText({
      model: openrouter.chat(modelId),
      system: fringWalletSystemPrompt(calendar),
      messages: trimmedMessages,
      tools: createFringWalletTools(calendar),
      temperature: 0.2,
      stopWhen: stepCountIs(16),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
