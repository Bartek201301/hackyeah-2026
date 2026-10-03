"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/shared/cn";

type NavLinkProps = {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
};

/** Same path (or a sub-path) and the same `view` query parameter; no view means the default "chat". */
export function isNavActive(href: string, pathname: string, view: string | null) {
  const target = new URL(href, "http://n");
  const samePath = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  return samePath && (target.searchParams.get("view") ?? "chat") === (view ?? "chat");
}

export function NavLink({ href, children, icon }: NavLinkProps) {
  const active = isNavActive(href, usePathname(), useSearchParams().get("view"));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg",
        active ? "bg-brand-soft font-medium text-fg" : "text-fg/80 hover:bg-surface-muted hover:text-fg",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Link>
  );
}
