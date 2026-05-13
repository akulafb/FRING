import "server-only";

import type { ModelMessage } from "ai";

const DEFAULT_CHAT_MESSAGE_WINDOW = 40;

/**
 * Keep only the trailing portion of assistant/user/tool transcripts so each
 * request does not replay unbounded megabyte histories to the model.
 * If the slice would start mid tool-output block, rewind to the preceding message.
 */
export function trimChatModelMessages(
  messages: ModelMessage[],
  maxMessages?: number,
): ModelMessage[] {
  const fromEnv = Number.parseInt(
    process.env.FRING_CHAT_MAX_MESSAGES ?? "",
    10,
  );

  const cap =
    maxMessages ??
    (Number.isFinite(fromEnv) && fromEnv > 0
      ? fromEnv
      : DEFAULT_CHAT_MESSAGE_WINDOW);

  if (messages.length <= cap) {
    return messages;
  }

  let start = messages.length - cap;
  while (start > 0 && messages[start]?.role === "tool") {
    start -= 1;
  }

  return messages.slice(start);
}
