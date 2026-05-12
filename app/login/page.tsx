"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          <div className="relative flex-1">
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="Access password…"
              aria-label="Access password"
              className="h-11 w-full rounded-xl border-border/80 bg-background py-2 pr-11 pl-4 text-base shadow-sm md:text-base"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              className="absolute top-1/2 right-1 size-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <EyeOff className="size-5" strokeWidth={2} />
              ) : (
                <Eye className="size-5" strokeWidth={2} />
              )}
            </Button>
          </div>
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
