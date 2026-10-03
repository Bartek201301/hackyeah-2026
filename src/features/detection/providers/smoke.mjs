// Manual synthetic smoke, never included in test/CI. Node 24 + the existing TypeScript install.
import { readFileSync, existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return next(
        fileURLToPath(new URL("node_modules/next/dist/compiled/server-only/empty.js", root)),
        context,
      );
    if (specifier.startsWith("@/")) specifier = new URL(`src/${specifier.slice(2)}`, root).href;
    if ((specifier.startsWith(".") || specifier.startsWith("file:")) && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(url) && existsSync(pathToFileURL(`${fileURLToPath(url)}.ts`)))
        specifier = `${url.href}.ts`;
    }
    return next(specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(new URL("src/", root).href) && url.endsWith(".ts")) {
      return {
        format: "commonjs",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            esModuleInterop: true,
          },
        }).outputText,
      };
    }
    return next(url, context);
  },
});
const require = createRequire(import.meta.url);
if (process.argv[2] === "--factories") await require("./factory-smoke-cases.ts").runFactorySmoke();
else await require("./smoke-cases.ts").runSyntheticSmoke();
