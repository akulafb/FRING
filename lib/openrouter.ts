import { createOpenAI } from "@ai-sdk/openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterClient(): ReturnType<typeof createOpenAI> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Copy env.example → .env.local and add your key."
    );
  }

  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();

  return createOpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    ...(referer
      ? {
          headers: {
            "HTTP-Referer": referer,
            "X-Title": "FRING",
          },
        }
      : { headers: { "X-Title": "FRING" } }),
  });
}
