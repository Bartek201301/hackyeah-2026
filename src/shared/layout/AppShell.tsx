import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck, SquarePen, type LucideIcon } from "lucide-react";
import { signOut } from "@/shared/auth/actions";
import type { ActorContext } from "@/shared/contracts";
import { cn } from "@/shared/cn";
import { Button } from "@/shared/ui";
import { MobileNav } from "./MobileNav";
import { NavLink } from "./NavLink";

export type NavItem = { href: string; label: string; icon?: LucideIcon };

type AppShellProps = {
  appName: string;
  nav: NavItem[];
  /** Rendered only for admins. Display only; the gateway decides access. */
  adminNav?: NavItem[];
  /** Display only; never decides access. */
  role?: ActorContext["role"];
  children: ReactNode;
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

/** Product mark: a neutral square with a shield. Also used by the standalone login screen. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-control bg-brand text-on-brand",
        className,
      )}
    >
      <ShieldCheck className="size-1/2" aria-hidden />
    </span>
  );
}

function Logo({ appName }: { appName: string }) {
  return (
    <Link
      href="/workbench"
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-control text-sm font-semibold text-fg",
        focusRing,
      )}
    >
      <LogoMark />
      <span className="truncate">{appName}</span>
    </Link>
  );
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col">
      {label && <h2 className="px-3 pt-5 pb-1.5 text-xs font-medium text-muted">{label}</h2>}
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label: text, icon: Icon }) => (
          <li key={href}>
            <NavLink href={href} icon={Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : undefined}>
              {text}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Account({ role }: { role: ActorContext["role"] }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-1 pt-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-brand uppercase"
        aria-hidden
      >
        {role.charAt(0)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-xs text-muted">Signed in as</span>
        <span className="truncate text-sm font-medium capitalize">{role}</span>
      </span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm" className="h-10">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}

function Sidebar({ appName, nav, adminNav = [], role }: Omit<AppShellProps, "children">) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex h-10 items-center pr-12 pl-2 lg:pr-2">
        <Logo appName={appName} />
      </div>
      <Link
        href="/workbench"
        className={cn(
          "flex h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium shadow-card transition-colors hover:bg-surface-muted",
          focusRing,
        )}
      >
        <SquarePen className="size-4" aria-hidden />
        New question
      </Link>
      <nav aria-label="Main" className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        <NavGroup items={nav} />
        {role === "admin" && adminNav.length > 0 && <NavGroup label="Admin" items={adminNav} />}
      </nav>
      {role && <Account role={role} />}
    </div>
  );
}

/**
 * Skeleton of every signed-in page, in the familiar AI-chat layout. Desktop: light-grey sidebar
 * (product, "New question", sections, account) + a white centred content column.
 * Phone: slim top bar whose menu button opens the same sidebar as a modal drawer.
 */
export function AppShell({ children, ...sidebar }: AppShellProps) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-brand focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-on-brand"
      >
        Skip to content
      </a>
      <div className="min-h-dvh lg:flex">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-bg lg:block">
          <div className="sticky top-0 h-dvh">
            <Sidebar {...sidebar} />
          </div>
        </aside>

        <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-border bg-surface/95 px-2 backdrop-blur lg:hidden">
          <MobileNav>
            <Sidebar {...sidebar} />
          </MobileNav>
          <Logo appName={sidebar.appName} />
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </>
  );
}
