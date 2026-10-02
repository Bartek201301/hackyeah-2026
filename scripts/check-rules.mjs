// Pilnuje zasad struktury repo (patrz CLAUDE.md). Bez zależności.
// BŁĄD = łamie izolację featurów (exit 1). OSTRZEŻENIE = sygnał dla integratora (nie blokuje).
// Fałszywy alarm? Usuń `npm run check:rules` ze skryptu "check" w package.json i pracuj dalej.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const APP_ROUTE_MAX_LINES = 15;
const errors = [];
const warnings = [];

const rel = (p) => relative(ROOT, p).split(sep).join("/");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// "src/features/abc/x.ts" -> ["features", "abc", "x.ts"]
const parts = (absPath) =>
  rel(absPath)
    .replace(/^src\//, "")
    .split("/");

function resolveImport(fromFile, spec) {
  if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
  if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
  return null; // pakiet z node_modules
}

const IMPORT_RE = /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["']/g;
const RAW_COLOR_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:bg|text|border|from|to|via|fill|stroke|ring|outline|shadow|decoration)-\[[^\]]+\]/;

const files = walk(SRC);

for (const file of files) {
  const p = parts(file);
  const area = p[0];
  const where = rel(file);

  if (area === "features" && file.endsWith(".css")) {
    errors.push(`${where}: pliki CSS w featurach są zabronione. Używaj klas tokenowych i @/shared/ui.`);
    continue;
  }
  if (!/\.(ts|tsx|mts|js|jsx)$/.test(file)) continue;

  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    const target = resolveImport(file, spec);
    if (!target || !target.startsWith(SRC)) continue;
    const t = parts(target);
    const line = text.slice(0, m.index).split("\n").length;

    if (area === "features" && t[0] === "features" && t[1] !== p[1]) {
      errors.push(
        `${where}:${line}: feature "${p[1]}" importuje z feature "${t[1]}" ("${spec}"). Featury nie mogą korzystać z siebie nawzajem — wspólny kod zgłoś integratorowi do src/shared/.`,
      );
    }
    if (area === "shared" && (t[0] === "features" || t[0] === "app")) {
      errors.push(
        `${where}:${line}: src/shared importuje z src/${t[0]} ("${spec}"). Shared nie może zależeć od featurów ani stron.`,
      );
    }
    if (area === "app" && t[0] === "features" && t.length > 2) {
      errors.push(
        `${where}:${line}: strona importuje wnętrze featura ("${spec}"). Importuj tylko "@/features/${t[1]}" (jego index.ts).`,
      );
    }
  }

  if (
    area === "app" &&
    p.length > 2 &&
    /from\s*["']@\/features\//.test(text) &&
    lines.filter((l) => l.trim()).length > APP_ROUTE_MAX_LINES
  ) {
    warnings.push(
      `${where}: plik strony ma ponad ${APP_ROUTE_MAX_LINES} linii. Strony mają być cienkie — logika i widok należą do src/features/.`,
    );
  }

  if (area === "features") {
    lines.forEach((l, i) => {
      if (RAW_COLOR_RE.test(l)) {
        errors.push(
          `${where}:${i + 1}: surowy kolor/wartość ("${l.trim().slice(0, 80)}"). Używaj tokenów (bg-brand, text-muted…) z src/app/globals.css.`,
        );
      }
    });
  }
}

// Ostrzeżenia o plikach wspólnych zmienionych na gałęzi (tylko gdy jesteśmy poza main).
const SHARED_PATHS = [
  "src/shared/",
  "src/app/nav.ts",
  "src/app/layout.tsx",
  "src/app/globals.css",
  "package.json",
  "package-lock.json",
  "supabase/",
];
try {
  const sh = (cmd) =>
    execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    let base = "";
    for (const ref of ["origin/main", "main"]) {
      try {
        base = sh(`git merge-base HEAD ${ref}`);
        break;
      } catch {}
    }
    if (base) {
      const changed = new Set(
        [
          ...sh(`git diff --name-only ${base}`).split("\n"),
          ...sh("git ls-files --others --exclude-standard").split("\n"),
        ].filter(Boolean),
      );
      const touched = [...changed].filter((f) => SHARED_PATHS.some((s) => f === s || f.startsWith(s)));
      if (touched.length) {
        warnings.push(
          `gałąź "${branch}" zmienia pliki wspólne: ${touched.join(", ")}. Te zmiany robi tylko integrator na main — zgłoś mu potrzebę i cofnij je u siebie, inaczej będzie konflikt przy scalaniu.`,
        );
      }
    }
  }
} catch {
  // brak gita albo brak main — pomijamy to sprawdzenie
}

for (const w of warnings) console.log(`⚠️  OSTRZEŻENIE ${w}`);
for (const e of errors) console.log(`❌ BŁĄD ${e}`);
if (errors.length) {
  console.log(`\ncheck:rules — ${errors.length} błąd(ów). Popraw powyższe pliki.`);
  process.exit(1);
}
console.log(`✅ check:rules — struktura OK${warnings.length ? ` (ostrzeżenia: ${warnings.length})` : ""}.`);
