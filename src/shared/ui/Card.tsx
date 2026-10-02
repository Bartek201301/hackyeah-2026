import type { HTMLAttributes } from "react";
import { cn } from "@/shared/cn";

/** Biała karta z obramowaniem i cieniem — podstawowy kontener treści. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface p-5 shadow-card", className)}
      {...rest}
    />
  );
}
