// `npm run new-feature <nazwa>` — tworzy nowy feature z wzorca src/features/example,
// jednolinijkową stronę src/app/<nazwa>/page.tsx i link w nawigacji (src/app/nav.ts).
// Uruchamia TYLKO integrator, na main, przed rozgałęzieniem.
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];
if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.log("❌ Podaj nazwę małymi literami, np.: npm run new-feature zgloszenia");
  process.exit(1);
}
const featureDir = join("src/features", slug);
const pageDir = join("src/app", slug);
if (existsSync(featureDir) || existsSync(pageDir)) {
  console.log(`❌ ${featureDir} albo ${pageDir} już istnieje.`);
  process.exit(1);
}

const pascal = slug
  .split("-")
  .map((s) => s[0].toUpperCase() + s.slice(1))
  .join("");
const camel = pascal[0].toLowerCase() + pascal.slice(1);

cpSync("src/features/example", featureDir, { recursive: true });

function processDir(dir) {
  for (const name of readdirSync(dir)) {
    let full = join(dir, name);
    if (name.includes("Example")) {
      const renamed = join(dir, name.replaceAll("Example", pascal));
      renameSync(full, renamed);
      full = renamed;
    }
    if (statSync(full).isDirectory()) processDir(full);
    else {
      const text = readFileSync(full, "utf8")
        .replaceAll("Example", pascal)
        .replaceAll("example", slug)
        .replaceAll("Przykład", pascal)
        .replace(/description: ".*"/, 'description: "Opis do uzupełnienia."');
      writeFileSync(full, text);
    }
  }
}
processDir(featureDir);

mkdirSync(pageDir, { recursive: true });
writeFileSync(join(pageDir, "page.tsx"), `export { default } from "@/features/${slug}";\n`);

const navPath = "src/app/nav.ts";
const nav = readFileSync(navPath, "utf8");
if (!nav.includes("// new-feature:imports") || !nav.includes("// new-feature:nav")) {
  console.log(`⚠️  Nie znalazłem znaczników w ${navPath} — dopisz link ręcznie.`);
} else {
  writeFileSync(
    navPath,
    nav
      .replace(
        "// new-feature:imports",
        `import { meta as ${camel} } from "@/features/${slug}";\n// new-feature:imports`,
      )
      .replace(
        "// new-feature:nav",
        `{ href: \`/\${${camel}.slug}\`, label: ${camel}.title },\n  // new-feature:nav`,
      ),
  );
}

console.log(`✅ Utworzono feature "${slug}":
   ${featureDir}/   (tu pracuje właściciel featura)
   ${pageDir}/page.tsx   (adres: /${slug})
   link w ${navPath}
Następnie: npm run check, commit na main, dopiero potem rozgałęzienia.`);
