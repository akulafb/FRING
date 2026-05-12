"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp } from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { FRING_PENDING_MESSAGE_KEY } from "@/lib/fring/pending-message";
import { type FormEvent, useState } from "react";

export function HomeChatEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      return;
    }
    sessionStorage.setItem(FRING_PENDING_MESSAGE_KEY, q);
    setValue("");
    router.push(`/chat?t=${nanoid()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-14 w-full max-w-md"
    >
      <div className="flex gap-2">
        <Input
          placeholder="Ask anything…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 flex-1 rounded-xl border-border/80 bg-background px-4 text-base shadow-sm md:text-base"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon-lg"
          className="size-11 shrink-0 rounded-xl"
          aria-label="Open chat and send"
        >
          <ArrowUp className="size-5" strokeWidth={2} />
        </Button>
      </div>
    </form>
  );
}
