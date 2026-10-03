// Dependency check; change ownership is verified by the PR reviewer (AGENTS.md).
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
        errors.push(
          `${location}: import/require must use a constant path so module boundaries can be checked.`,
        );
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
      errors.push(`${label} — imports another feature; shared code belongs in shared.`);
    }
    if (area === "features" && targetArea === "app") errors.push(`${label} — a feature must not import app.`);
    if (area === "shared" && ["features", "app"].includes(targetArea))
      errors.push(`${label} — shared must not depend on ${targetArea}.`);
    if (
      area === "app" &&
      targetArea === "features" &&
      rest.length &&
      !(rest.length === 1 && /^index(?:\.[cm]?[jt]sx?)?$/.test(rest[0]))
    ) {
      errors.push(`${label} — app imports only the feature's public index.ts.`);
    }
  }
  if (
    area === "features" &&
    /(?:bg|text|border|fill|stroke)-\[(?:#|rgb|hsl)|\b(?:bg|text|border)-(?:red|blue|green|gray|slate)-\d/.test(
      text,
    )
  ) {
    warnings.push(`${location}: check colours — prefer tokens from shared/ui. This is a hint, not an error.`);
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
      errors.push(`${relative(root, file)}: CSS belongs in the shared tokens.`);
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
      if (shared.length) warnings.push(`Shared changes require the integrator: ${shared.join(", ")}.`);
      const features = new Set(
        [...changed].filter((file) => file.startsWith("src/features/")).map((file) => file.split("/")[2]),
      );
      if (features.size > 1)
        warnings.push(
          `Changes in several features: ${[...features].join(", ")}. Confirm the owners in the PR.`,
        );
    }
  } catch {
    /* Missing Git history does not affect the import check. */
  }
  return { errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { errors, warnings } = checkRules();
  for (const warning of warnings) console.log(`⚠️ ${warning}`);
  for (const error of errors) console.error(`❌ ${error}`);
  console.log(errors.length ? `check:rules — errors: ${errors.length}` : "✅ check:rules — structure OK.");
  process.exitCode = errors.length ? 1 : 0;
}
