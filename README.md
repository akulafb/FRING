This is **FRING** (“Fahd’s Really Intelligent Numbers Guy”): Next.js App Router + read-only [Wallet REST](https://budgetbakers.com/en/products/wallet/integrations/rest-api/), OpenRouter (AI SDK streaming), deterministic aggregation tools, Recharts-backed `fring_present_chart`, and IndexedDB thread persistence.

### Stack and how it works

**What you see in the browser**

- The **chat page** (`/chat`) is a normal React client UI built with the [Vercel AI SDK React helpers](https://sdk.vercel.ai/docs) (`useChat` + `DefaultChatTransport`).
- Your **conversation text** is sent to the server as a stream-friendly request; replies stream back and update the UI in real time.
- **Threads** are saved only **in your browser** (IndexedDB via `idb-keyval`), keyed by the `t=` value in the URL — nothing is stored on FRING’s server for chat history in v1.
- When the model uses the **`fring_present_chart`** tool, the UI reads the structured chart payload and draws it with **Recharts** (bar, line, area, scatter).

**What runs on the server (Next.js Route Handler)**

- **`POST /api/chat`** runs on the server. It never exposes your Wallet or OpenRouter keys to the browser — they live only in environment variables.
- The handler calls **OpenRouter** using an OpenAI-compatible client (`@ai-sdk/openai` pointed at OpenRouter’s base URL), with the model id from env (e.g. `OPENROUTER_MODEL`).
- Important: OpenRouter splits **chat/completions** and **responses** endpoints. FRING selects the **`provider.chat(modelId)`** path so streaming + tool-result turns don’t incorrectly hit Responses (which surfaced as **`Invalid Responses API request`** until this binding).
- The model gets **tools** (function calling): Wallet reads (`accounts`, `records`, `budgets`, etc.), deterministic **`wallet_aggregate_spend`** (TypeScript/`Decimal.js` — no hallucinated totals), and **`fring_present_chart`** for validated chart JSON the UI renders.
- **`datePreset` / “today”** use a **single calendar snapshot per request**: your browser sends **`Intl` timezone** (`clientTimeZone`), the server applies **server UTC time** interpreted in that zone (so “today” is your local wall date, not the model guessing a year). If the browser hint is absent, **`FRING_USER_TIMEZONE`** or UTC is used.
- Aggregations unwrap common Wallet quirks: **`category` / `account` may be nested objects** (avoid `"[object Object]"` grouping keys); **amount may live under alternate keys** than `amount`; nested objects are scanned to find a plausible numeric transaction field before summing.

**How Wallet data gets in**

- Server code calls **BudgetBakers Wallet REST** with your **`WALLET_REST_TOKEN`** (`Authorization: Bearer …`).
- List endpoints may be **cached briefly** in memory to spare the **500 requests/hour** quota; pagination follows Wallet’s **`limit` / `offset` / `nextOffset`** rules (max 100 rows per request).

**End-to-end flow (one prompt)**

```text
You type in /chat  →  browser sends messages to POST /api/chat
                   →  model may call Wallet tools (read-only HTTP)
                   →  totals/grouping run in server code where needed
                   →  optional chart tool returns JSON for Recharts
                   →  streamed assistant message (+ tool bubbles) back to UI
                   →  thread snapshot saved to IndexedDB
```

### Environment

Copy [`env.example`](./env.example) → `.env.local` and set **`OPENROUTER_API_KEY`** and **`WALLET_REST_TOKEN`**. Optionally **`WALLET_REST_BASE_URL`** (defaults to Wallet production). The chat UI sends your **browser timezone** automatically on each request (`Intl`); set **`FRING_USER_TIMEZONE`** only as a fallback when calling the API without a browser (defaults to UTC otherwise). Mirror values in Vercel as encrypted env vars (`NEXT_PUBLIC_*` only for intentional client exposure — never secrets).

### Access gate (no paid Vercel Deployment Protection)

FRING uses **Option A**: **`FRING_ACCESS_PASSWORD`** plus **`FRING_AUTH_SECRET`** issue a signed **httpOnly** JWT cookie (`fring_session`). [**Proxy**](proxy.ts) (Next.js request gate) blocks **`/`**, **`/chat`**, and **`POST /api/chat`** until you sign in at **`/login`**.

- **Production:** If either gate env var is missing, protected routes respond **503** (fail closed).
- **Local dev:** If both are unset, the gate is **skipped** so `npm run dev` works without typing a password.

Before deploying to Vercel, add **`FRING_ACCESS_PASSWORD`** and **`FRING_AUTH_SECRET`** (e.g. `openssl rand -hex 32`) for **Production** (and Preview if you use previews), then redeploy.

### Routes

| Path | Behavior |
|------|----------|
| `/` | Landing + entry to chat (requires session cookie when gate configured in prod) |
| `/login` | Password form → sets session cookie |
| `/chat` | Chat UI; redirects to `/chat?t=<nanoid>`; IndexedDB restores `fring-v1-chat-<id>` |
| `POST /api/auth/login` | Validates password; sets `fring_session` JWT cookie |
| `POST /api/chat` | `toUIMessageStreamResponse` for `DefaultChatTransport` + `useChat` |

### Dev

```bash
npm run dev
```

Browse **`/`**. With **`FRING_ACCESS_PASSWORD`** and **`FRING_AUTH_SECRET`** in `.env.local`, visit **`/login`** once per browser profile first. Omit **both** gate variables locally if you want to disable the gate during development.

Bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
