import { PDFDict, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import policyJson from "../../../docs/contracts/policy.example.json";
import feedJson from "../../../docs/contracts/threat-feed.example.json";
import type { ActorContext, Assessment, DetectionPort, GenerationPort } from "@/shared/contracts";
import manifest from "@/shared/contracts/runtime-manifest.json";
import { sha256Hex } from "./checks";
import { GatewayError } from "./envelope";
import { downloadExport, EXPORT_PROMPT, executeExport, startExport } from "./exports";
import { exportText, PDF_TITLE, renderPdf, wrap } from "./pdf";
import type {
  ExportPublication,
  ExportRow,
  FinalOutcome,
  PermittedExcerpt,
  RepositoryPort,
  RunRecord,
} from "./ports";
import { toCitation } from "./retrieval";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "44444444-4444-4444-8444-444444444444";
const EXPORT_ID = "99999999-9999-4999-8999-999999999999";
const TOPIC = "Give me a public AsterCloud summary and a PDF.";
const actor: ActorContext = {
  actor_id: "55555555-5555-4555-8555-555555555555",
  organisation_id: "66666666-6666-4666-8666-666666666666",
  role: "analyst",
  deal_ids: ["33333333-3333-4333-8333-333333333333"],
  audience: "actor",
  scopes: [],
};
const other: ActorContext = { ...actor, actor_id: "77777777-7777-4777-8777-777777777777" };

// TEST FAKE: the demo corpus shape — public rows next to internal/restricted ones the export must never see.
const row = (n: number, classification: PermittedExcerpt["classification"], label: string, text: string) => ({
  id: `8888888${n}-8888-4888-8888-88888888888${n}`,
  version: 1,
  text,
  classification,
  locator: `row:${n}`,
  source_date: "2025-03-15",
  period: "FY2025",
  unit: "USD million",
  basis: "actual" as const,
  fact_key: "revenue",
  source_label: label,
});
const PUB = row(1, "public", "PUB-01", "AsterCloud reported FY2025 revenue of USD 120 million.");
const WEB = row(2, "public", "PUB-02", "AsterCloud hosts a public product webinar on 12 June 2025.");
const CORPUS: PermittedExcerpt[] = [
  PUB,
  WEB,
  row(3, "internal", "FIN-01", "Finance workbook lists FY2025 revenue as USD 125 million."),
  row(4, "internal", "OPS-01", "Operations reconciliation lists FY2025 revenue as USD 122 million."),
  row(5, "internal", "FC-01", "FY2026 forecast is USD 164 million."),
  row(6, "restricted", "ASTER-BID", "Bid floor USD 640 million, walk-away 910, Mira 176; key sk-demo-123."),
  row(7, "restricted", "BOREAL", "Boreal deal memo."),
];
const FORBIDDEN = ["125", "122", "164", "640", "910", "176", "sk-demo", "Mira", "ASTER-BID", "BOREAL"];

/** Every word the PDF shows, extracted independently of pdf-lib (AT11). */
async function extract(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join("\n"));
  }
  const { info } = await doc.getMetadata();
  return { text: pages.join("\n"), info: info as Record<string, unknown> };
}

type Opts = { finalize: boolean; outputScore: number; store: "ok" | "throw" };

// TEST FAKE: unit tests only; the app never composes these.
function harness(over: Partial<Opts> = {}) {
  const o: Opts = { finalize: true, outputScore: 0.05, store: "ok", ...over };
  const searches: Parameters<RepositoryPort["searchPermittedExcerpts"]>[1][] = [];
  const rechecks: Parameters<RepositoryPort["readPermittedExcerpts"]>[] = [];
  const assessed: { text: string; operation: string; audience: string }[] = [];
  const prompts: string[] = [];
  const stored: { key: string; bytes: Uint8Array }[] = [];
  const exportsFinal: { outcome: FinalOutcome; publication: ExportPublication }[] = [];
  const runsFinal: FinalOutcome[] = [];
  const started: Parameters<RepositoryPort["startRun"]>[0][] = [];
  const run: RunRecord = {
    id: RUN_ID,
    kind: "export",
    state: "pending",
    stage: "queued",
    policy_version: 1,
    feed_version: 1,
    input_private: { topic: TOPIC, deal_id: null },
    result_private: null,
    lease_expires_at: null,
  };
  const visible = (audience: string) =>
    CORPUS.filter((e) => audience === "actor" || e.classification === "public");
  const repository = {
    async loadActivePolicyAndFeed() {
      return {
        policy: structuredClone(policyJson),
        feed: structuredClone(feedJson),
        policy_version: 1,
        feed_version: 1,
        feed_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      };
    },
    async startRun(input: Parameters<RepositoryPort["startRun"]>[0]) {
      started.push(input);
      return {
        run_id: input.traceId,
        kind: input.kind,
        state: "pending",
        stage: "queued",
        replay: false,
        policy_version: 1,
        feed_version: 1,
      };
    },
    async readRun(_a: ActorContext, id: string) {
      return id === run.id ? run : null;
    },
    async beginOperation() {
      return { operation_id: "op", state: "intent", replay: false, policy_version: 1, feed_version: 1 };
    },
    async claimRun() {
      return "lease";
    },
    async reserveCall() {},
    async finishCall() {
      return { settled: 1, unresolved: 0, overrun: false };
    },
    // The SQL filter, honoured: audience public returns public rows only, whatever the actor's role.
    async searchPermittedExcerpts(_a: ActorContext, input: { audience: string }) {
      searches.push(input as Parameters<RepositoryPort["searchPermittedExcerpts"]>[1]);
      return visible(input.audience);
    },
    async readPermittedExcerpts(...args: Parameters<RepositoryPort["readPermittedExcerpts"]>) {
      rechecks.push(args);
      return visible(args[1]).filter((e) => args[2].includes(e.id));
    },
    async storeExport(key: string, bytes: Uint8Array) {
      if (o.store === "throw") throw new GatewayError("STATE_UNAVAILABLE");
      stored.push({ key, bytes });
    },
    async finalizeExport(input: { outcome: FinalOutcome; publication: ExportPublication }) {
      exportsFinal.push(input);
      return o.finalize;
    },
    async finalizeRun(input: { outcome: FinalOutcome }) {
      runsFinal.push(input.outcome);
      return o.finalize;
    },
  } as unknown as RepositoryPort;

  const detection: DetectionPort = {
    async parse() {
      throw new Error("not used");
    },
    async assess(input) {
      assessed.push({ text: input.text, operation: input.operation, audience: input.audience });
      const score = input.operation.endsWith("output") ? o.outputScore : 0.05;
      const semantic: Assessment = {
        status: "complete",
        scores: { instruction_manipulation: score, sensitive_exposure: 0.01, resource_abuse: 0.01 },
        checkpoint_revision: manifest.laya_checkpoint_revision,
        windows_planned: 1,
        windows_completed: 1,
        coverage_complete: true,
        text_sha256: sha256Hex(input.text),
        coverage_ranges: [{ start_char: 0, end_char: [...input.text].length, input_tokens: 40 }],
      };
      return { findings: [], semantic, semantic_input_tokens: 40, semantic_ms: 10 };
    },
  };
  // A model that leaks everything it was given: each source line is echoed with its tag.
  const generation: GenerationPort = {
    async generate(input) {
      const system = input.messages[0].content;
      prompts.push(system);
      const text = [...system.matchAll(/^\[S(\d+)\][^:]*: (.*)$/gm)]
        .map((m) => `${m[2]} [S${m[1]}]`)
        .join(" ");
      return {
        text,
        tool_calls: [],
        input_tokens: 100,
        output_tokens: 50,
        duration_ms: 500,
        model_digest: manifest.ollama_model_digest,
        finished: true,
      };
    },
  };
  const deps = { repository, detection, generation };
  return {
    searches,
    rechecks,
    assessed,
    prompts,
    stored,
    exportsFinal,
    runsFinal,
    started,
    start: () => startExport(deps, actor, { topic: TOPIC }, KEY),
    execute: () => executeExport(deps, actor, RUN_ID, KEY, new AbortController().signal),
  };
}

describe("export run", () => {
  it("starts an export run with the topic, open to any role", async () => {
    const h = harness();
    const out = await h.start();
    expect(out.status).toBe(202);
    expect(h.started[0]).toMatchObject({ kind: "export", operation: "export_start" });
    expect(h.started[0].inputPrivate).toEqual({ topic: TOPIC, deal_id: null });
  });

  it("uses audience public for search, Laya and the recheck, and never verifies", async () => {
    const h = harness();
    const out = await h.execute();
    expect(out.status).toBe(200);
    expect(out.body.decision).toBe("ALLOW");
    expect(h.searches.map((s) => s.audience)).toEqual(["public"]);
    expect(h.rechecks.map((r) => r[1])).toEqual(["public"]);
    expect(h.assessed.map((a) => [a.operation, a.audience])).toEqual([
      ["export_input", "public"],
      ["export_output", "public"],
    ]);
    // One generation: no contextual verification call for exports.
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0].startsWith(EXPORT_PROMPT)).toBe(true);
    expect(EXPORT_PROMPT).toContain("Briefly cover each provided source, each with its citation.");
  });

  it("never puts an internal or restricted excerpt into the prompt", async () => {
    const h = harness();
    await h.execute();
    for (const value of FORBIDDEN) expect(h.prompts[0]).not.toContain(value);
    expect(h.prompts[0]).toContain("120");
  });

  it("stores the PDF under the server key and finalizes the export with the released path", async () => {
    const h = harness();
    const out = await h.execute();
    const [{ publication, outcome }] = h.exportsFinal;
    expect(h.runsFinal).toHaveLength(0);
    expect(h.stored.map((s) => s.key)).toEqual([`${actor.organisation_id}/${publication.id}.pdf`]);
    expect(publication.storage_key).toBe(h.stored[0].key);
    expect(publication.excerpt_versions).toEqual([
      { excerpt_id: PUB.id, version: 1 },
      { excerpt_id: WEB.id, version: 1 },
    ]);
    const data = {
      download_path: `/api/v1/exports/${publication.id}/download`,
      expires_at: publication.expires_at,
    };
    expect(out.body.data).toEqual(data);
    expect(outcome.result?.data).toEqual(data);
    expect(outcome).toMatchObject({ operation: "export_start", run_state: "completed", stage: "done" });
    const minutes = (Date.parse(publication.expires_at) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    // The answer text is in the file, never in the stored result or the audit event.
    expect(JSON.stringify(outcome)).not.toContain("120 million");
  });

  it("releases no download path when finalize does not commit", async () => {
    const h = harness({ finalize: false });
    const out = await h.execute();
    expect(out.body.error?.code).toBe("AUDIT_UNAVAILABLE");
    expect(out.body.data ?? null).toBeNull();
    expect(JSON.stringify(out.body)).not.toContain("download");
  });

  it("produces no file on an output REVIEW", async () => {
    const h = harness({ outputScore: 0.99 });
    const out = await h.execute();
    expect(out.body.decision).not.toBe("ALLOW");
    expect(h.stored).toHaveLength(0);
    expect(h.exportsFinal).toHaveLength(0);
    expect(JSON.stringify(out.body)).not.toContain("download");
  });

  it("finalizes as incomplete and releases nothing when the upload fails", async () => {
    const h = harness({ store: "throw" });
    const out = await h.execute();
    expect(out.body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(h.exportsFinal).toHaveLength(0);
    expect(h.runsFinal[0]).toMatchObject({ run_state: "incomplete", stage: "publication" });
  });

  it("AT11: the stored PDF holds only the public facts, in text and metadata (pdfjs extraction)", async () => {
    const h = harness();
    await h.execute();
    const { text, info } = await extract(h.stored[0].bytes);
    expect(text).toContain("120");
    expect(text).toContain("webinar");
    expect(text).toContain("PUB-01");
    // CreationDate is the generation clock by design; at 01:25 UTC it holds "125", so it is not content.
    const metadata = JSON.stringify({ ...info, CreationDate: undefined });
    for (const value of FORBIDDEN) {
      expect(text).not.toContain(value);
      expect(metadata).not.toContain(value);
    }
    expect(info.Title).toBe(PDF_TITLE);
    expect(info.Producer).toBeUndefined();
    expect(info.Creator).toBeUndefined();
  });
});

describe("renderPdf", () => {
  const citations = [toCitation(PUB)];
  const answer = "AsterCloud reported FY2025 revenue of USD 120 million [1].";

  it("writes only the title and creation date, with no attachments, annotations or scripts", async () => {
    const now = new Date("2026-10-04T03:00:00Z");
    const { bytes } = await renderPdf(answer, citations, now);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    expect(info.keys().map((k) => k.asString())).toEqual(["/Title", "/CreationDate"]);
    expect(doc.getTitle()).toBe(PDF_TITLE);
    expect(doc.getCreationDate()?.toISOString()).toBe(now.toISOString());
    expect(
      doc.catalog
        .keys()
        .map((k) => k.asString())
        .sort(),
    ).toEqual(["/Pages", "/Type"]);
    // Loading normalizes an empty Annots array onto each page; it must stay empty.
    for (const page of doc.getPages()) expect(page.node.Annots()?.size() ?? 0).toBe(0);
  });

  it("draws the answer and the sources, and nothing else", async () => {
    const { bytes, text } = await renderPdf(answer, citations, new Date());
    expect(text).toBe(`${answer}\n\nSources\n[1] PUB-01, 2025-03-15, FY2025`);
    const extracted = (await extract(bytes)).text.replace(/\s+/g, " ");
    expect(extracted).toContain(answer);
    expect(extracted).toContain("[1] PUB-01, 2025-03-15, FY2025");
  });

  it("folds text Helvetica cannot encode instead of failing", async () => {
    expect(exportText("Kraków – “quoted” ✓", [])).toBe('Krakow - "quoted" \n\nSources\n(none)');
  });

  it("wraps at 90 characters and splits an overlong word", () => {
    const lines = wrap(`${"word ".repeat(40)}\n${"x".repeat(200)}`);
    expect(lines.every((l) => l.length <= 90)).toBe(true);
    expect(lines.join("")).toContain("x".repeat(90));
  });
});

describe("export download", () => {
  const ready: ExportRow = {
    id: EXPORT_ID,
    run_id: RUN_ID,
    storage_key: `${actor.organisation_id}/${EXPORT_ID}.pdf`,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    status: "ready",
    excerpt_versions: [{ excerpt_id: PUB.id, version: 1 }],
  };
  function download(
    who: ActorContext,
    id: string,
    { row = ready, permitted = [PUB], audit = "ok" as "ok" | "throw" } = {},
  ) {
    const recorded: Parameters<RepositoryPort["recordAccessDecision"]>[0][] = [];
    const files: string[] = [];
    const repository = {
      // Owner filter as in the query: organisation and actor must match.
      async readExport(a: ActorContext, i: string) {
        return i === row.id && a.actor_id === actor.actor_id ? row : null;
      },
      async readPermittedExcerpts(_a: ActorContext, _aud: string, ids: string[]) {
        return permitted.filter((e) => ids.includes(e.id));
      },
      async readExportFile(key: string) {
        files.push(key);
        return new Uint8Array([37, 80, 68, 70]);
      },
      async recordAccessDecision(input: Parameters<RepositoryPort["recordAccessDecision"]>[0]) {
        if (audit === "throw") throw new GatewayError("STATE_UNAVAILABLE");
        recorded.push(input);
        return { trace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", policy_version: 1, feed_version: 1 };
      },
    } as unknown as RepositoryPort;
    const deps = { repository, detection: null, generation: null };
    return { recorded, files, result: downloadExport(deps, who, id) };
  }
  const status = (r: Response | { status: number }) => r.status;

  it("streams the owner's ready export with no-store and the access trace", async () => {
    const d = download(actor, EXPORT_ID);
    const res = (await d.result) as Response;
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-trace-id")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(d.recorded[0]).toMatchObject({ operation: "export_download", decision: "ALLOW" });
  });

  const denied: [string, ActorContext, string, Parameters<typeof download>[2]][] = [
    ["another actor", other, EXPORT_ID, {}],
    ["a guessed id", actor, "12345678-1234-4234-8234-123456789012", {}],
    ["a malformed id", actor, "../../etc", {}],
    [
      "an expired export",
      actor,
      EXPORT_ID,
      { row: { ...ready, expires_at: new Date(Date.now() - 1000).toISOString() } },
    ],
    ["a revoked export", actor, EXPORT_ID, { row: { ...ready, status: "revoked" } }],
    ["a cited version no longer public", actor, EXPORT_ID, { permitted: [] }],
  ];
  it.each(denied)("answers %s with the same audited 404 and no bytes", async (_name, who, id, opts) => {
    const d = download(who, id, opts);
    const out = await d.result;
    expect(out).not.toBeInstanceOf(Response);
    expect(status(out)).toBe(404);
    expect(d.files).toHaveLength(0);
    expect(d.recorded[0]).toMatchObject({ decision: "BLOCK", reasons: ["export:unavailable"] });
    expect(d.recorded[0].event).toEqual({ stage: "access" });
  });

  it("withholds the file when the access cannot be audited", async () => {
    const out = await download(actor, EXPORT_ID, { audit: "throw" }).result;
    expect(out).not.toBeInstanceOf(Response);
    expect(status(out)).toBe(503);
  });
});
