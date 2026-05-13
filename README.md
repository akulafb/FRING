This is **FRING** (“Fahd’s Really Intelligent Numbers Guy”): Next.js App Router + read-only [Wallet REST](https://budgetbakers.com/en/products/wallet/integrations/rest-api/), OpenRouter (AI SDK streaming), deterministic aggregation tools, Recharts-backed `fring_present_chart`, and IndexedDB thread persistence.

### Quick start (fork / self-host, minimal steps)

**Prerequisites:** Node **20.9+** (see [`package.json`](./package.json) `engines`), a **Wallet Premium** REST token, an **OpenRouter** API key, and optionally a **GitHub + Vercel** account if you deploy.

**Local**

1. `git clone` this repo and `cd` into it.
2. `cp env.example .env.local`
3. Set **`OPENROUTER_API_KEY`** and **`WALLET_REST_TOKEN`** in `.env.local` (see comments in [`env.example`](./env.example)).
4. *(Optional, dev convenience)* Leave **`FRING_ACCESS_PASSWORD`** and **`FRING_AUTH_SECRET`** **empty** to skip `/login` while developing locally.
5. `npm install` then **`npm run build`** once to validate types and env wiring.
6. `npm run dev` → open `http://localhost:3000`

**Production (e.g. Vercel)**

1. Create a **new Vercel project** from **your fork** (or push this repo to GitHub and import).
2. In **Settings → Environment variables**, copy every key from **`env.example`**, using **Encrypted** scope for Production (and Preview if you want PR previews).
3. **Required in Production:** **`FRING_ACCESS_PASSWORD`** and **`FRING_AUTH_SECRET`** (`openssl rand -hex 32`) — otherwise the app **fails closed (503)** on protected routes.
4. Set **`OPENROUTER_HTTP_REFERER`** to your real site URL (OpenRouter attribution).
5. Deploy; visit **`/login`**, enter the access password once per browser.

**GitHub “Template repository”** (optional): In the repo **Settings → General → Template repository**, enable *Template* so others get a clean copy with one click.

### Security (read before going public)

- **Never commit** `.env.local` or any file with keys — `.gitignore` already ignores `.env*`.
- **Wallet token = full read access** to the linked Wallet account. Each self-hoster should use **their own** token; rotate it under Wallet if it leaks.
- **OpenRouter key** is charged to their account — keep server-only (`NEXT_PUBLIC_*` is never used here for secrets by design).
- **Access gate** (`FRING_ACCESS_PASSWORD` + JWT cookie) is a **single shared passphrase** per deployment — fine for friends & colleagues, **not** a substitute for SSO or per-user auth. Anyone with the URL + password reaches the assistant and can query whatever the Wallet token can see.
- **Chat transcripts** stay in **browser IndexedDB** only; **`POST /api/chat`** sends messages to OpenRouter servers per their policy.

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

### Environment variables

All keys live in **`env.example`** — copy into **`.env.local`** (local) and into **Vercel → Environment Variables** (production). Highlights: **`FRING_USER_TIMEZONE`** is optional (browser TZ is preferred); **`WALLET_REST_BASE_URL`** overrides only if Wallet gives you a non-default REST host; **`FRING_CHAT_MAX_MESSAGES`** optionally caps replayed transcript size for cost. **Never** expose `OPENROUTER_*`, `WALLET_*`, `FRING_ACCESS_PASSWORD`, or `FRING_AUTH_SECRET` under `NEXT_PUBLIC_*`.

### Access gate (`proxy`)

FRING uses **`FRING_ACCESS_PASSWORD`** + **`FRING_AUTH_SECRET`** for an **httpOnly** JWT (**`fring_session`**). **`proxy.ts`** protects **`/`**, **`/chat`**, **`POST /api/chat`**. Behaviour matches **Quick start** / production bullets above ([`proxy.ts`](proxy.ts) for implementation).

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
