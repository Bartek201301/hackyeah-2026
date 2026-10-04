// Static component preview only; no authentication, database or network mock is presented as live UI.
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import report from "../../docs/testing/control-assessment/live-chat-results.json";
import { StageList } from "../../src/features/audit/components/StageList";
import { stageRows } from "../../src/features/audit/trace";
import type { AuditProjection } from "../../src/shared/contracts";

it("renders both assessments from the recorded synthetic gateway result without content", () => {
  const body = report.records.find((r) => r.id === "missing_sources")?.outcome.body;
  if (!body) throw new Error("Missing live evidence");
  const events = [
    {
      event_type: "decision",
      stage: "done",
      created_at: "2026-10-04T00:00:00Z",
      policy_version: 1,
      feed_version: 1,
      findings: [],
      semantic: body.semantic,
      usage: body.usage,
    },
  ] as NonNullable<AuditProjection["events"]>;
  const html = renderToStaticMarkup(<StageList rows={stageRows(events)} />);
  expect(html).toContain("Question assessment");
  expect(html).toContain("Proposed answer assessment");
  expect(html).toContain("Qwen verification: no attack identified in context");
  expect(html).not.toContain("Brief me on AsterCloud");
  expect(html).not.toContain(body.data?.answer);
  if (process.env.TRACE_PREVIEW_DIR) {
    const dir = process.env.TRACE_PREVIEW_DIR;
    mkdirSync(dir, { recursive: true });
    cpSync(".next/static", `${dir}/_next/static`, { recursive: true });
    const links = readdirSync(".next/static/chunks")
      .filter((f) => f.endsWith(".css"))
      .map((f) => `<link rel="stylesheet" href="/_next/static/chunks/${f}">`)
      .join("");
    writeFileSync(
      `${dir}/index.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trace component preview</title>${links}</head><body><main class="mx-auto max-w-4xl p-4"><h1 class="mb-4 text-xl font-semibold">Synthetic trace component preview</h1><p class="mb-4 text-sm">Recorded live model result; isolated test repository. This is not a deployed audit page.</p>${html}</main></body></html>`,
    );
  }
});
