// Kontrola zależności; właścicieli zmian weryfikuje recenzent PR (AGENTS.md).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const normalize = (path) => path.split(sep).join("/");

export function analyzeSource(root, file, text) {
  const errors = [];
  const warnings = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const location = normalize(relative(root, file));
  const [, area, feature] = location.split("/");
  const imports = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = node.moduleReference.expression;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifier = node.arguments[0];
      if (!specifier || (!ts.isStringLiteral(specifier) && !ts.isNoSubstitutionTemplateLiteral(specifier))) {
        errors.push(`${location}: import/require musi mieć stałą ścieżkę, aby sprawdzić granice modułów.`);
      }
    }
    if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier))) {
      imports.push({ spec: specifier.text, pos: specifier.getStart(source) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const { spec, pos } of imports) {
    const target = spec.startsWith("@/")
      ? resolve(root, "src", spec.slice(2))
      : spec.startsWith(".")
        ? resolve(dirname(file), spec)
        : null;
    if (!target) continue;
    const [src, targetArea, targetFeature, ...rest] = normalize(relative(root, target)).split("/");
    if (src !== "src") continue;
    const line = source.getLineAndCharacterOfPosition(pos).line + 1;
    const label = `${location}:${line}: ${spec}`;
    if (area === "features" && targetArea === "features" && targetFeature !== feature) {
      errors.push(`${label} — import innego featura; wspólny kod należy do shared.`);
    }
    if (area === "features" && targetArea === "app")
      errors.push(`${label} — feature nie może importować app.`);
    if (area === "shared" && ["features", "app"].includes(targetArea))
      errors.push(`${label} — shared nie może zależeć od ${targetArea}.`);
    if (
      area === "app" &&
      targetArea === "features" &&
      rest.length &&
      !(rest.length === 1 && /^index(?:\.[cm]?[jt]sx?)?$/.test(rest[0]))
    ) {
      errors.push(`${label} — app importuje tylko publiczne index.ts featura.`);
    }
  }
  if (
    area === "features" &&
    /(?:bg|text|border|fill|stroke)-\[(?:#|rgb|hsl)|\b(?:bg|text|border)-(?:red|blue|green|gray|slate)-\d/.test(
      text,
    )
  ) {
    warnings.push(`${location}: sprawdź kolory — preferuj tokeny z shared/ui. To wskazówka, nie błąd.`);
  }
  return { errors, warnings };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

export function checkRules(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  for (const file of walk(join(root, "src"))) {
    if (normalize(relative(root, file)).startsWith("src/features/") && file.endsWith(".css")) {
      errors.push(`${relative(root, file)}: CSS należy do wspólnych tokenów.`);
    }
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const result = analyzeSource(root, file, readFileSync(file, "utf8"));
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  try {
    const git = (...args) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");
    if (branch !== "main") {
      const base = git("merge-base", "HEAD", "origin/main");
      const changed = new Set(
        [
          ...git("diff", "--name-only", base).split("\n"),
          ...git("ls-files", "--others", "--exclude-standard").split("\n"),
        ].filter(Boolean),
      );
      const shared = [...changed].filter((file) => !file.startsWith("src/features/"));
      if (shared.length) warnings.push(`Zmiany wspólne wymagają integratora: ${shared.join(", ")}.`);
      const features = new Set(
        [...changed].filter((file) => file.startsWith("src/features/")).map((file) => file.split("/")[2]),
      );
      if (features.size > 1)
        warnings.push(`Zmiany w kilku featurach: ${[...features].join(", ")}. Potwierdź właścicieli w PR.`);
    }
  } catch {
    /* Brak historii Git nie wpływa na kontrolę importów. */
  }
  return { errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { errors, warnings } = checkRules();
  for (const warning of warnings) console.log(`⚠️ ${warning}`);
  for (const error of errors) console.error(`❌ ${error}`);
  console.log(errors.length ? `check:rules — błędy: ${errors.length}` : "✅ check:rules — struktura OK.");
  process.exitCode = errors.length ? 1 : 0;
}
