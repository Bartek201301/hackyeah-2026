import type { ReactNode } from "react";
import Link from "next/link";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string };

type AppShellProps = {
  appName: string;
  nav: NavItem[];
  children: ReactNode;
};

/** Szkielet każdej strony: górny pasek z nazwą aplikacji i nawigacją + wyśrodkowana treść. */
export function AppShell({ appName, nav, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight text-fg">
            {appName}
          </Link>
          <nav className="flex gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
