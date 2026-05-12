"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const proseBase =
  "prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-strong:font-semibold prose-a:underline prose-a:underline-offset-4 prose-blockquote:border-l-primary/40 prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:leading-relaxed prose-ol:list-decimal prose-ul:list-disc prose-table:text-sm prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1";

const proseAssistant = `${proseBase} text-foreground prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-strong:text-foreground prose-a:text-primary prose-blockquote:text-muted-foreground prose-code:bg-muted prose-code:text-foreground prose-pre:bg-muted prose-pre:border-border prose-pre:text-sm prose-th:border prose-th:border-border prose-th:bg-muted/60 prose-td:border prose-td:border-border prose-hr:border-border`;

const proseUser = `${proseBase} prose-invert max-w-none text-primary-foreground prose-headings:text-primary-foreground prose-p:text-primary-foreground/95 prose-li:text-primary-foreground/95 prose-strong:text-primary-foreground prose-a:text-primary-foreground prose-blockquote:border-l-primary-foreground/40 prose-blockquote:text-primary-foreground/85 prose-code:bg-primary-foreground/15 prose-code:text-primary-foreground prose-pre:bg-primary-foreground/10 prose-pre:border-primary-foreground/20 prose-pre:text-primary-foreground/95 prose-th:border-primary-foreground/25 prose-th:bg-primary-foreground/10 prose-td:border-primary-foreground/20 prose-hr:border-primary-foreground/25`;

const markdownComponents: Partial<Components> = {
  a: ({ href, children }) => (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline underline-offset-4"
    >
      {children}
    </a>
  ),
};

type MarkdownVariant = "assistant" | "user";

type MarkdownProps = {
  children: string;
  className?: string;
  variant?: MarkdownVariant;
};

export function MarkdownContent({
  children,
  className,
  variant = "assistant",
}: MarkdownProps) {
  if (!children.trim()) {
    return null;
  }

  const prose = variant === "user" ? proseUser : proseAssistant;

  return (
    <div className={prose + (className ? ` ${className}` : "")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
