import type { ReactNode } from "react";
import Link from "next/link";
import { Blocks, House, LogOut, Sparkles, type LucideIcon } from "lucide-react";
import { signOut } from "@/shared/auth/actions";
import type { ActorContext } from "@/shared/contracts";
import { Button } from "@/shared/ui";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string; icon?: LucideIcon };

type AppShellProps = {
  appName: string;
  nav: NavItem[];
  /** Display only; never decides access. */
  role?: ActorContext["role"];
  children: ReactNode;
};

const home: NavItem = { href: "/", label: "Start", icon: House };
const tools: NavItem[] = [{ href: "/ui", label: "UI blocks", icon: Blocks }];

function Logo({ appName }: { appName: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-fg">
      <span className="flex size-9 items-center justify-center rounded-control bg-brand text-on-brand shadow-brand">
        <Sparkles className="size-5" aria-hidden />
      </span>
      {appName}
    </Link>
  );
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</span>
      {items.map(({ href, label, icon: Icon }) => (
        <NavLink key={href} href={href} icon={Icon ? <Icon className="size-5" aria-hidden /> : undefined}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}

function Session({ role }: { role: ActorContext["role"] }) {
  return (
    <form action={signOut} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm text-muted">
        Signed in as <span className="font-medium text-fg">{role}</span>
      </span>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </form>
  );
}

/**
 * Skeleton of every page. Desktop: white sidebar menu (card) + content on a lavender background.
 * Phone: top bar with the logo and scrollable navigation.
 */
export function AppShell({ appName, nav, role, children }: AppShellProps) {
  const all = [home, ...nav];
  return (
    <div className="min-h-dvh lg:flex lg:gap-6 lg:p-6">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-6 flex h-[calc(100dvh-3rem)] flex-col gap-8 overflow-y-auto rounded-card bg-surface p-5 shadow-card">
          <Logo appName={appName} />
          <NavGroup title="Menu" items={all} />
          <NavGroup title="Tools" items={tools} />
          {role && (
            <div className="mt-auto">
              <Session role={role} />
            </div>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center gap-4 px-4">
          <Logo appName={appName} />
        </div>
        {role && (
          <div className="px-4 pb-2">
            <Session role={role} />
          </div>
        )}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
          {all.map(({ href, label }) => (
            <NavLink key={href} href={href} compact>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-2 lg:py-2">
        {children}
      </main>
    </div>
  );
}
