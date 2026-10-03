"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle } from "lucide-react";
import { cn } from "@/shared/cn";

type NavLinkProps = {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Horizontal variant (phone bar) — no icon. */
  compact?: boolean;
};

export function NavLink({ href, children, icon, compact = false }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 whitespace-nowrap rounded-control text-sm font-medium transition-colors",
        compact ? "px-3.5 py-2" : "px-3 py-2.5",
        active ? "bg-brand text-on-brand shadow-brand" : "text-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      {!compact && (icon ?? <Circle className="size-5" aria-hidden />)}
      {children}
    </Link>
  );
}
