/*
 * App navigation. The `npm run new-feature` script appends to `nav` (run by the integrator on a
 * branch; PR merged before builders start work). Do not add anything here by hand on your branch.
 */
import {
  Activity,
  Building2,
  FileText,
  FolderUp,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { NavItem } from "@/shared/layout/AppShell";
import { meta as featureWorkbenchMeta } from "@/features/workbench";
import { meta as featureAuditMeta } from "@/features/audit";
import { meta as featureClientsMeta } from "@/features/clients";
// new-feature:imports

export const APP_NAME = "InterLock";

const workbench = `/${featureWorkbenchMeta.slug}`;

export const nav: NavItem[] = [
  { href: workbench, label: "Ask", icon: MessageSquare },
  { href: `${workbench}?view=sources`, label: "Sources", icon: FolderUp },
  { href: `${workbench}?view=export`, label: "Public summary", icon: FileText },
  { href: `/${featureAuditMeta.slug}`, label: "Activity", icon: Activity },
  { href: `/${featureClientsMeta.slug}`, label: featureClientsMeta.title, icon: Building2 },
  // new-feature:nav
];

/** Shown only to admins. Presentation only: the gateway refuses these calls for anyone else. */
export const adminNav: NavItem[] = [
  { href: `${workbench}?view=review`, label: "Review", icon: ShieldCheck },
  { href: `${workbench}?view=policy`, label: "Policy and feed", icon: SlidersHorizontal },
];
