/*
 * Nawigacja aplikacji. Plik edytuje WYŁĄCZNIE skrypt `npm run new-feature`
 * (uruchamiany przez integratora na gałęzi; PR scalany przed pracą builderów).
 * Nie dopisuj tu nic ręcznie na swojej gałęzi.
 */
import type { NavItem } from "@/shared/layout/AppShell";
import { meta as example } from "@/features/example";
// new-feature:imports

export const APP_NAME = "HackYeah 2026";

export const nav: NavItem[] = [
  { href: `/${example.slug}`, label: example.title },
  // new-feature:nav
];
