"use client";

import type { UIMessage } from "ai";
import {
  DefaultChatTransport,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { get, set } from "idb-keyval";
import { nanoid } from "nanoid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FringMessage } from "@/components/fring/fring-message";
import { FRING_PENDING_MESSAGE_KEY } from "@/lib/fring/pending-message";

function chatStorageKey(threadId: string) {
  return `fring-v1-chat-${threadId}`;
}

/** Inner chat with persistence + hydration (mount only after IndexedDB restore). */
export function FringChatSession({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({
          api,
          body,
          credentials,
          headers,
          id,
          messages,
          trigger,
          messageId,
        }) => {
          let clientTimeZone: string | undefined;
          try {
            clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          } catch {
            clientTimeZone = undefined;
          }
          return {
            api,
            credentials,
            headers,
            body: {
              ...body,
              id,
              messages,
              trigger,
              messageId,
              ...(typeof clientTimeZone === "string" &&
              clientTimeZone.trim() !== ""
                ? { clientTimeZone }
                : {}),
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  const pendingBootstrappedRef = useRef(false);

  useEffect(() => {
    if (pendingBootstrappedRef.current) {
      return;
    }
    const raw = sessionStorage.getItem(FRING_PENDING_MESSAGE_KEY);
    if (!raw?.trim()) {
      return;
    }
    pendingBootstrappedRef.current = true;
    sessionStorage.removeItem(FRING_PENDING_MESSAGE_KEY);
    void sendMessage({ text: raw.trim() });
  }, [sendMessage, threadId]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      void set(chatStorageKey(threadId), messages);
    }, 450);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [threadId, messages]);

  const [text, setText] = useState("");
  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            FRING
          </p>
          <p className="text-sm text-muted-foreground">
            Read-only Wallet · OpenRouter
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/chat?t=${nanoid()}`)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            New thread
          </button>
          <Link
            href="/"
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:underline"
          >
            Home
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-8 md:px-8">
          {messages.length === 0 ? (
            <p className="mx-auto max-w-xl text-center text-sm text-muted-foreground">
              Ask about spending, budgets, or accounts. FRING calls Wallet REST
              tools and uses deterministic rollups for totals—no mental math.
            </p>
          ) : null}
          {messages.map((m) => (
            <FringMessage key={m.id} message={m} />
          ))}
        </div>

        {error ? (
          <div className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error.message}
          </div>
        ) : null}

        <form
          className="shrink-0 border-t border-border bg-background p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t || busy) {
              return;
            }
            setText("");
            await sendMessage({ text: t });
          }}
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <textarea
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-[44px] flex-1 resize-y rounded-xl border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
              rows={2}
              placeholder="Ask about your Wallet data…"
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={busy || !text.trim()}
                className="rounded-xl px-4"
              >
                Send
              </Button>
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void stop()}
                  className="rounded-xl text-xs"
                >
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FringChatHydrate({ threadId }: { threadId: string }) {
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<UIMessage[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const stored = await get(chatStorageKey(threadId));
        if (!live) {
          return;
        }
        if (Array.isArray(stored)) {
          setInitial(stored as UIMessage[]);
        }
      } finally {
        if (live) {
          setReady(true);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [threadId]);

  if (!ready) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
        Restoring thread…
      </div>
    );
  }

  return <FringChatSession threadId={threadId} initialMessages={initial} />;
}

function ChatThreadInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get("t");

  useEffect(() => {
    if (!threadId) {
      router.replace(`/chat?t=${nanoid()}`);
    }
  }, [threadId, router]);

  if (!threadId) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm">
        Starting thread…
      </div>
    );
  }

  return <FringChatHydrate threadId={threadId} />;
}

export function ChatThreadPage() {
  return (
    <div className="bg-background flex h-[100dvh] flex-col overflow-hidden">
      <Suspense
        fallback={
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading chat…
          </div>
        }
      >
        <ChatThreadInner />
      </Suspense>
    </div>
  );
}
