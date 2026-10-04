// Control matrix: runs the vitest files named in docs/testing/control-matrix.json and passes a row only
// when every mapped test (matched by file and full name) ran and passed. Offline; needs no .env.local.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const key = (file, test) => `${file}\u0000${test}`;

/** Maps "file\0fullName" to every status vitest reported for it (names can repeat within a file). */
export function indexResults(report, cwd) {
  const index = new Map();
  for (const file of report?.testResults ?? []) {
    const rel = relative(cwd, file.name).split("\\").join("/");
    for (const a of file.assertionResults ?? []) {
      const k = key(rel, a.fullName);
      index.set(k, [...(index.get(k) ?? []), a.status]);
    }
  }
  return index;
}

/** "passed" only when the test exists and every run of it passed; otherwise missing/skipped/todo/failed. */
export function proofStatus(index, { file, test }) {
  const statuses = index.get(key(file, test));
  if (!statuses) return "missing";
  return statuses.find((s) => s !== "passed") ?? "passed";
}

export function evaluateRows(rows, index) {
  return rows.map((row) => {
    const check = (proofs) => proofs.map((p) => ({ ...p, status: proofStatus(index, p) }));
    const allow = check(row.allow);
    const block = check(row.block);
    const pass =
      allow.length > 0 && block.length > 0 && [...allow, ...block].every((p) => p.status === "passed");
    return { ...row, allow, block, pass };
  });
}

const cell = (s) => String(s).replaceAll("|", "\\|");
const proofs = (list) =>
  list
    .map(
      (p) =>
        `${p.file.replace(/^src\/|\.test\.tsx?$/g, "")}: ${p.test}${p.status === "passed" ? "" : ` [${p.status.toUpperCase()}]`}`,
    )
    .join("; ");

export function renderTable(results, notImplemented) {
  const lines = [
    "| ID | PDF | Control | ALLOW proof | BLOCK/REVIEW/503 proof | Result |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${[r.id, r.pdf_ref, r.control, proofs(r.allow), proofs(r.block), r.pass ? "PASS" : "FAIL"].map(cell).join(" | ")} |`,
    ),
    "",
    "NOT IMPLEMENTED (does not affect the exit code)",
    "",
    "| ID | PDF | Item | Note |",
    "| --- | --- | --- | --- |",
    ...notImplemented.map((n) => `| ${[n.id, n.pdf_ref, n.item, n.note].map(cell).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function main() {
  const manifest = JSON.parse(readFileSync(join(root, "docs/testing/control-matrix.json"), "utf8"));
  const files = [...new Set(manifest.rows.flatMap((r) => [...r.allow, ...r.block].map((p) => p.file)))];
  const dir = mkdtempSync(join(tmpdir(), "control-matrix-"));
  const out = join(dir, "vitest.json");
  let report = null;
  try {
    spawnSync("npx", ["vitest", "run", ...files, "--reporter=json", `--outputFile=${out}`], {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
    });
    report = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    console.error("control-matrix: vitest produced no JSON report; every row fails.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const results = evaluateRows(manifest.rows, indexResults(report, root));
  console.log(renderTable(results, manifest.not_implemented));
  let sha = "unknown";
  try {
    sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {}
  const passed = results.filter((r) => r.pass).length;
  console.log(
    `\ncommit ${sha} · rows ${passed}/${results.length} PASS · ${files.length} test files · ` +
      `${report?.numPassedTests ?? 0}/${report?.numTotalTests ?? 0} tests passed · ` +
      `${manifest.not_implemented.length} not implemented`,
  );
  process.exitCode = passed === results.length ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
