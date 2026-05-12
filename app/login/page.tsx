"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const pw = password.trim();
    if (!pw || busy) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      const from = searchParams.get("from");
      const safe =
        from &&
        from.startsWith("/") &&
        !from.startsWith("//") &&
        !from.startsWith("/login")
          ? from
          : "/";
      router.replace(safe);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-14 w-full max-w-md">
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="Access password…"
            aria-label="Access password"
            className="h-11 flex-1 rounded-xl border-border/80 bg-background px-4 text-base shadow-sm md:text-base"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="size-11 shrink-0 rounded-xl"
            disabled={busy || !password.trim()}
            aria-label="Sign in"
          >
            <ArrowUp className="size-5" strokeWidth={2} />
          </Button>
        </div>
      </form>
      {error ? (
        <p className="mt-3 text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <h1 className="font-heading text-[clamp(2.5rem,9vw,4.75rem)] font-semibold tracking-[-0.06em] text-foreground">
          FRING
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground sm:text-[0.9375rem]">
          Fahd&apos;s Really Intelligent Numbers Guy
        </p>
        <p className="mt-3 text-pretty text-sm text-muted-foreground sm:text-[0.9375rem]">
          Enter your access password to continue.
        </p>

        <Suspense
          fallback={
            <p className="mx-auto mt-14 max-w-md text-sm text-muted-foreground">
              Loading…
            </p>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
