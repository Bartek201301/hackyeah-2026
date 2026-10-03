import { describe, expect, it } from "vitest";
import {
  CSV_HEADER,
  EMPTY_UPLOAD_DRAFT,
  PDF_UNAVAILABLE,
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

const DEAL = "7f1d6d2e-4a44-4f6a-9d6f-6a3b2c1d0e9f";

describe("CSV header", () => {
  it("matches the order fixed by the scenarios", () => {
    expect(CSV_HEADER).toEqual(["text", "source_date", "period", "unit", "fact_key", "basis"]);
  });
});

describe("formatOf", () => {
  it("recognises csv and pdf case-insensitively", () => {
    expect(formatOf("FACTS.CSV")).toBe("csv");
    // Still recognised although refused: the refusal says why, not just "wrong extension".
    expect(formatOf("Report.PDF")).toBe("pdf");
  });

  it("returns null for anything else", () => {
    expect(formatOf("notes.txt")).toBeNull();
    expect(formatOf("")).toBeNull();
    expect(formatOf("archive.csv.zip")).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a CSV with only a classification", () => {
    expect(validateUpload(csv())).toEqual({ ok: true, format: "csv" });
  });

  it("refuses a PDF in the server's own words", () => {
    // The demo build answers 415 with this sentence; saying it here saves the round trip and
    // means the form and the gateway never disagree about why.
    const result = validateUpload(csv({ fileName: "report.pdf", classification: "restricted" }));
    expect(result).toEqual({ ok: false, errors: { fileName: PDF_UNAVAILABLE } });
  });

  it("requires a file and refuses an unsupported extension", () => {
    expect(validateUpload(csv({ fileName: "" }))).toEqual({
      ok: false,
      errors: { fileName: "Choose a CSV file to upload." },
    });
    expect(validateUpload(csv({ fileName: "notes.txt" }))).toEqual({
      ok: false,
      errors: { fileName: "Only a CSV can be uploaded." },
    });
  });

  it("requires a valid classification", () => {
    expect(validateUpload(csv({ classification: "" })).ok).toBe(false);
    const invalid = validateUpload(csv({ classification: "secret" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.classification).toBe("Choose a valid classification.");
  });

  it("only enforces a size limit when one was supplied", () => {
    const big = csv({ fileSize: 10_000 });
    expect(validateUpload(big).ok).toBe(true);
    expect(validateUpload(big, { maxBytes: null }).ok).toBe(true);
    const refused = validateUpload(big, { maxBytes: 5_000 });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors.fileSize).toContain("5000");
  });
});

describe("buildUploadBody", () => {
  it("sends only the file and its classification", () => {
    const body = buildUploadBody(csv(), new File(["text,source_date\n"], "facts.csv"));
    expect([...body.keys()].sort()).toEqual(["classification", "file"]);
    expect(body.get("classification")).toBe("internal");
  });

  it("includes the deal id when given, trimmed", () => {
    const body = buildUploadBody(csv({ dealId: ` ${DEAL} ` }), null);
    expect(body.get("deal_id")).toBe(DEAL);
  });

  it("never sends the attribution fields a CSV carries per row", () => {
    // startUpload refuses a CSV that declares any of these, so an extra field is a failed upload.
    const body = buildUploadBody(csv({ dealId: DEAL }), null);
    for (const field of ["source_date", "period", "unit", "fact_key", "basis"]) {
      expect(body.has(field)).toBe(false);
    }
  });

  it("never invents a file entry when none was chosen", () => {
    expect(buildUploadBody(csv(), null).has("file")).toBe(false);
  });
});
