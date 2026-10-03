import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeSource } from "../check-rules.mjs";
import { generateFeature } from "../new-feature.mjs";
import { validateSupabaseConfig, checkSupabaseConnection } from "../../src/shared/supabase-config.mjs";

const root = resolve(".");
const analyze = (file, source) => analyzeSource(root, join(root, "src", file), source);

test("granice: realne importy, eksporty, require i import type są kontrolowane", () => {
  for (const source of [
    'import x from "@/features/b";',
    'export { x } from "../b";',
    'import "@/features/b";',
    'const x = import("@/features/b");',
    'const x = require("@/features/b");',
    'import x = require("@/features/b");',
    'type X = import("@/features/b").X;',
  ])
    assert.equal(analyze("features/a/index.ts", source).errors.length, 1, source);
  assert.equal(analyze("features/a/index.ts", 'import x from "@/app/nav"').errors.length, 1);
  assert.equal(analyze("shared/a.ts", 'import x from "@/features/b"').errors.length, 1);
  assert.equal(analyze("shared/a.ts", 'import x from "@/app/nav"').errors.length, 1);
  assert.equal(analyze("app/page.tsx", 'import x from "@/features/a/queries"').errors.length, 1);
  assert.equal(analyze("features/a/index.ts", "import(path)").errors.length, 1);
});

test("granice: komentarze, przykłady tekstowe, własne i wspólne importy są dozwolone", () => {
  const source = `// import x from "@/features/b";
    const example = 'import x from "@/features/b"';
    import x from "./queries";
    import y from "@/shared/types";
    import z from "react";`;
  assert.deepEqual(analyze("features/a/index.ts", source).errors, []);
  assert.deepEqual(analyze("app/page.tsx", 'export { default } from "@/features/a/index.ts"').errors, []);
});

test("kotwice i rozmiary tekstu nie są błędami kolorów", () => {
  const result = analyze("features/a/page.tsx", '<a href="#abc" className="text-[14px]">ok</a>');
  assert.deepEqual(result, { errors: [], warnings: [] });
  const warning = analyze("features/a/page.tsx", '<p className="bg-red-500">ok</p>');
  assert.equal(warning.errors.length, 0);
  assert.equal(warning.warnings.length, 1);
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "hackyeah-tooling-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(root, "src/features/example"), join(dir, "src/features/example"), { recursive: true });
  mkdirSync(join(dir, "src/app"), { recursive: true });
  writeFileSync(
    join(dir, "src/app/nav.ts"),
    "export const nav = [\n// new-feature:nav\n];\n// new-feature:imports\n",
  );
  return dir;
}
function snapshot(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [
      join(entry.parentPath, entry.name).slice(dir.length),
      readFileSync(join(entry.parentPath, entry.name), "utf8"),
    ])
    .sort();
}

test("generator: nav jest poprawną nazwą, powtórzenie nie zmienia plików", async (t) => {
  const dir = fixture(t);
  await generateFeature(dir, "nav");
  assert.ok(existsSync(join(dir, "src/features/nav/components/NavPage.tsx")));
  assert.match(readFileSync(join(dir, "src/app/nav.ts"), "utf8"), /meta as featureNavMeta/);
  const before = snapshot(dir);
  await assert.rejects(generateFeature(dir, "nav"), /istnieje/);
  assert.deepEqual(snapshot(dir), before);
});

test("generator: poprawna nazwa z myślnikiem", async (t) => {
  const dir = fixture(t);
  await generateFeature(dir, "help-center");
  assert.match(readFileSync(join(dir, "src/features/help-center/meta.ts"), "utf8"), /slug: "help-center"/);
});

test("generator: błędne nazwy odrzucane przed zapisem", async (t) => {
  const dir = fixture(t);
  const before = snapshot(dir);
  for (const slug of [undefined, "", "help-", "help--me", "../escape", "UPPER", "1test"]) {
    await assert.rejects(generateFeature(dir, slug));
    assert.deepEqual(snapshot(dir), before);
  }
});

test("generator: brak lub duplikat markerów oraz kolizja aliasu nie zostawiają plików", async (t) => {
  const dir = fixture(t);
  const nav = join(dir, "src/app/nav.ts");
  for (const content of [
    "export const nav = [];",
    "// new-feature:imports\n// new-feature:imports\n// new-feature:nav",
    "const featureHelpMeta = {};\n// new-feature:imports\n// new-feature:nav",
  ]) {
    writeFileSync(nav, content);
    const before = snapshot(dir);
    await assert.rejects(generateFeature(dir, "help"));
    assert.deepEqual(snapshot(dir), before);
  }
});

test("generator: brak pliku wzorca odrzucany przed zapisem", async (t) => {
  const dir = fixture(t);
  rmSync(join(dir, "src/features/example/meta.ts"));
  const before = snapshot(dir);
  await assert.rejects(generateFeature(dir, "help"), /wzorca/);
  assert.deepEqual(snapshot(dir), before);
});

const config = { url: "https://test.supabase.co", key: "sb_publishable_test" };
test("konfiguracja: jeden format URL i tylko publishable key, bez wartości klucza w błędzie", () => {
  assert.deepEqual(validateSupabaseConfig(" https://test.supabase.co/ ", " sb_publishable_test "), config);
  for (const key of [undefined, "", "sb_secret_private", "eyJlegacy", "sb_publishable_"]) {
    assert.throws(
      () => validateSupabaseConfig(config.url, key),
      (error) => {
        assert.ok(!error.message.includes("private"));
        assert.ok(!error.message.includes("eyJlegacy"));
        return true;
      },
    );
  }
  for (const url of [
    undefined,
    "http://test.supabase.co",
    "https://test.supabase.co.evil",
    "https://test.supabase.co/path",
  ]) {
    assert.throws(() => validateSupabaseConfig(url, config.key));
  }
});

test("diagnostyka: sukces wymaga poprawnej odpowiedzi RPC", async () => {
  const calls = [];
  const checks = await checkSupabaseConnection(config, {
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return Response.json(options.method === "POST" ? "ok now" : {});
    },
  });
  assert.equal(checks.length, 2);
  assert.ok(checks.every((check) => check.ok));
  assert.equal(calls[1][1].method, "POST");
  assert.ok(calls.every(([, options]) => options.signal instanceof AbortSignal));
});

test("diagnostyka: HTTP i błąd drugiego żądania są czytelnym FAIL", async () => {
  const http = await checkSupabaseConnection(config, {
    fetchImpl: async () => new Response("secret", { status: 401 }),
  });
  assert.equal(http.length, 1);
  assert.equal(http[0].ok, false);
  assert.ok(!http[0].detail.includes("secret"));
  let count = 0;
  const rpc = await checkSupabaseConnection(config, {
    fetchImpl: async () => {
      if (++count === 2) throw new Error("network");
      return Response.json({});
    },
  });
  assert.deepEqual(
    rpc.map((check) => check.ok),
    [true, false],
  );
  const malformed = await checkSupabaseConnection(config, { fetchImpl: async () => Response.json({}) });
  assert.equal(malformed[1].ok, false);
});

test("diagnostyka: timeout przerywa oczekiwanie", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await checkSupabaseConnection(config, {
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        ),
    });
    assert.equal(result[0].ok, false);
    assert.match(result[0].detail, /czas oczekiwania/);
  } finally {
    clearTimeout(keepAlive);
  }
});
