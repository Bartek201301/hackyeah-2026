"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/cn";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand-soft text-brand" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
