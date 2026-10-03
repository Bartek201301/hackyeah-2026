import { describe, expect, it } from "vitest";
import {
  CSV_HEADER,
  EMPTY_UPLOAD_DRAFT,
  buildUploadBody,
  formatOf,
  validateUpload,
  type UploadDraft,
} from "./importForm";

const csv = (over: Partial<UploadDraft> = {}): UploadDraft => ({
  ...EMPTY_UPLOAD_DRAFT,
  fileName: "facts.csv",
  classification: "internal",
  ...over,
});

const pdf = (over: Partial<UploadDraft> = {}): UploadDraft => ({
  ...EMPTY_UPLOAD_DRAFT,
  fileName: "report.pdf",
  classification: "restricted",
  sourceDate: "2026-09-28",
  period: "FY2026",
  unit: "USD million",
  factKey: "revenue",
  basis: "forecast",
  ...over,
});

describe("CSV header", () => {
  it("matches the order fixed by the scenarios", () => {
    expect([...CSV_HEADER]).toEqual(["text", "source_date", "period", "unit", "fact_key", "basis"]);
  });
});

describe("formatOf", () => {
  it("recognises csv and pdf case-insensitively", () => {
    expect(formatOf("a.csv")).toBe("csv");
    expect(formatOf("A.CSV")).toBe("csv");
    expect(formatOf("b.PdF")).toBe("pdf");
  });

  it("returns null for anything else", () => {
    for (const n of ["a.txt", "a.pdf.exe", "pdf", "", "a.csv.zip"]) {
      expect(formatOf(n)).toBeNull();
    }
  });
});

describe("validateUpload", () => {
  it("accepts a CSV with only a classification", () => {
    expect(validateUpload(csv())).toEqual({ ok: true, format: "csv" });
  });

  it("does not demand attribution fields for a CSV, which carries them per row", () => {
    const out = validateUpload(csv({ sourceDate: "", period: "", unit: "", factKey: "", basis: "" }));
    expect(out.ok).toBe(true);
  });

  it("requires all five attribution fields for a text PDF", () => {
    expect(validateUpload(pdf()).ok).toBe(true);
    for (const field of ["sourceDate", "period", "unit", "factKey", "basis"] as const) {
      const out = validateUpload(pdf({ [field]: "" }));
      expect(out.ok, field).toBe(false);
      if (!out.ok) expect(out.errors[field]).toBeTruthy();
    }
  });

  it("rejects whitespace-only attribution values", () => {
    const out = validateUpload(pdf({ period: "   " }));
    expect(out.ok).toBe(false);
  });

  it("requires a file and refuses an unsupported extension", () => {
    const none = validateUpload(csv({ fileName: "" }));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors.fileName).toMatch(/choose a file/i);

    const bad = validateUpload(csv({ fileName: "notes.txt" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.fileName).toMatch(/CSV or a text PDF/i);
  });

  it("requires a valid classification", () => {
    expect(validateUpload(csv({ classification: "" })).ok).toBe(false);
    expect(validateUpload(csv({ classification: "secret" })).ok).toBe(false);
    for (const c of ["public", "internal", "restricted"]) {
      expect(validateUpload(csv({ classification: c })).ok).toBe(true);
    }
  });

  it("rejects a valid-looking but invalid basis", () => {
    expect(validateUpload(pdf({ basis: "guess" })).ok).toBe(false);
  });

  it("only enforces a size limit when one was supplied", () => {
    const big = csv({ fileSize: 10_000 });
    expect(validateUpload(big).ok).toBe(true);
    expect(validateUpload(big, { maxBytes: null }).ok).toBe(true);
    expect(validateUpload(big, { maxBytes: 2_097_152 }).ok).toBe(true);

    const out = validateUpload(big, { maxBytes: 5_000 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.fileSize).toMatch(/larger than the current limit/i);
  });
});

describe("buildUploadBody", () => {
  it("sends only the contract's fields for a CSV", () => {
    const body = buildUploadBody(csv({ dealId: "  " }), null);
    expect([...body.keys()].sort()).toEqual(["classification"]);
  });

  it("includes the deal id when given, trimmed", () => {
    const body = buildUploadBody(csv({ dealId: " deal-1 " }), null);
    expect(body.get("deal_id")).toBe("deal-1");
  });

  it("sends the five attribution fields for a PDF only", () => {
    const pdfBody = buildUploadBody(pdf(), null);
    expect([...pdfBody.keys()].sort()).toEqual([
      "basis",
      "classification",
      "fact_key",
      "period",
      "source_date",
      "unit",
    ]);

    // A CSV must not appear to declare document-level attribution.
    const csvBody = buildUploadBody(csv({ period: "FY2025", unit: "USD million" }), null);
    expect(csvBody.has("period")).toBe(false);
    expect(csvBody.has("unit")).toBe(false);
  });

  it("never invents a file entry when none was chosen", () => {
    expect(buildUploadBody(csv(), null).has("file")).toBe(false);
  });
});
