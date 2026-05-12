import { HomeChatEntry } from "@/components/fring/home-chat-entry";

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <h1 className="font-heading text-[clamp(2.5rem,9vw,4.75rem)] font-semibold tracking-[-0.06em] text-foreground">
          FRING
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground sm:text-[0.9375rem]">
          Fahd&apos;s Really Intelligent Numbers Guy
        </p>

        <HomeChatEntry />
      </div>
    </main>
  );
}
