/*
 * App navigation. This file is edited ONLY by the `npm run new-feature` script
 * (run by the integrator on a branch; PR merged before builders start work).
 * Do not add anything here by hand on your branch.
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
