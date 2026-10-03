/*
 * Nawigacja aplikacji. Plik edytuje WYŁĄCZNIE skrypt `npm run new-feature`
 * (uruchamiany przez integratora na gałęzi; PR scalany przed pracą builderów).
 * Nie dopisuj tu nic ręcznie na swojej gałęzi.
 */
import type { NavItem } from "@/shared/layout/AppShell";
import { meta as example } from "@/features/example";
import { meta as featureWorkbenchMeta } from "@/features/workbench";
import { meta as featureAuditMeta } from "@/features/audit";
// new-feature:imports

export const APP_NAME = "HackYeah 2026";

export const nav: NavItem[] = [
  { href: `/${example.slug}`, label: example.title },
  { href: `/${featureWorkbenchMeta.slug}`, label: featureWorkbenchMeta.title },
  { href: `/${featureAuditMeta.slug}`, label: featureAuditMeta.title },
  // new-feature:nav
];
