import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UrlLinkProps {
  href: string;
  className?: string;
  showIcon?: boolean;
  truncate?: number;
  children?: React.ReactNode;
}

function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function middleTruncate(s: string, max: number): string {
  if (max <= 3 || s.length <= max) return s;
  const half = Math.floor((max - 3) / 2);
  if (half <= 0) return s;
  return `${s.slice(0, half)}...${s.slice(-half)}`;
}

export function UrlLink({
  href,
  className,
  showIcon = true,
  truncate,
  children,
}: UrlLinkProps) {
  const normalized = normalizeHref(href);
  if (!normalized) return null;

  const rawDisplay = href.trim();
  const displayString =
    typeof truncate === "number" && truncate > 0
      ? middleTruncate(rawDisplay, truncate)
      : rawDisplay;

  return (
    <a
      href={normalized}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 text-cyan-600 hover:text-cyan-700 hover:underline font-mono text-xs",
        className
      )}
    >
      <span>{children ?? displayString}</span>
      {showIcon && <ExternalLink className="size-3 opacity-70" />}
    </a>
  );
}

export function isLikelyUrl(s: string): boolean {
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}/i.test(s);
}
