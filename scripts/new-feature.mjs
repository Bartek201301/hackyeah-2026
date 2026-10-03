// Integrator uruchamia na krótkiej gałęzi, następnie PR i scalenie przed pracą builderów.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import prettier from "prettier";
import ts from "typescript";

export async function generateFeature(root, slug) {
  if (!slug || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Podaj nazwę małymi literami, np. npm run new-feature zgloszenia.");
  }
  const featureDir = join(root, "src/features", slug);
  const pageDir = join(root, "src/app", slug);
  if (existsSync(featureDir) || existsSync(pageDir)) throw new Error("Feature lub trasa już istnieje.");
  const template = join(root, "src/features/example");
  for (const file of [
    "index.ts",
    "meta.ts",
    "queries.ts",
    "actions.ts",
    "types.ts",
    "components/ExamplePage.tsx",
    "components/ExampleForm.tsx",
  ]) {
    if (!existsSync(join(template, file))) throw new Error(`Brak pliku wzorca: ${file}`);
  }
  const navPath = join(root, "src/app/nav.ts");
  const nav = readFileSync(navPath, "utf8");
  for (const marker of ["// new-feature:imports", "// new-feature:nav"]) {
    if (nav.split(marker).length !== 2) throw new Error(`Nawigacja musi zawierać dokładnie jeden ${marker}.`);
  }
  const pascal = slug
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  const alias = `feature${pascal}Meta`;
  const source = ts.createSourceFile(navPath, nav, ts.ScriptTarget.Latest, true);
  let collision = false;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === alias) collision = true;
    if (ts.isStringLiteral(node) && node.text === `@/features/${slug}`) collision = true;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (collision) throw new Error(`Nawigacja zawiera już feature lub nazwę ${alias}.`);
  const writes = new Map();
  function collect(dir, output) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const from = join(dir, entry.name);
      const to = join(output, entry.name.replaceAll("Example", pascal));
      if (entry.isDirectory()) collect(from, to);
      else
        writes.set(
          to,
          readFileSync(from, "utf8")
            .replaceAll("Example", pascal)
            .replaceAll("example", slug)
            .replaceAll("Przykład", pascal),
        );
    }
  }
  collect(template, featureDir);
  writes.set(join(pageDir, "page.tsx"), `export { default } from "@/features/${slug}";\n`);
  writes.set(
    navPath,
    nav
      .replace(
        "// new-feature:imports",
        `import { meta as ${alias} } from "@/features/${slug}";\n// new-feature:imports`,
      )
      .replace(
        "// new-feature:nav",
        `{ href: \`/\${${alias}.slug}\`, label: ${alias}.title },\n  // new-feature:nav`,
      ),
  );
  // Wszystkie walidacje i formatowanie przed pierwszym zapisem.
  const options = (await prettier.resolveConfig(navPath)) ?? {};
  for (const [file, content] of writes)
    writes.set(file, await prettier.format(content, { ...options, filepath: file }));
  for (const [file, content] of writes) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await generateFeature(process.cwd(), process.argv[2]);
    console.log(
      `✅ Utworzono ${process.argv[2]}. Uruchom npm run check, commit i PR. Builder zaczyna po scaleniu.`,
    );
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}
