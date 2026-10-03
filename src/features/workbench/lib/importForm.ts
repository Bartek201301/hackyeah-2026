/*
 * Upload form rules for `POST /imports/upload`.
 *
 * These are usability checks only. docs/product/technical-spec.md §4 puts the real decisions on the
 * server: it counts bytes, inspects magic/type, enforces role, deal and classification, scans the
 * complete text and controls publication. A browser check on a filename proves nothing — its only
 * job is to stop an obvious mistake before a pointless round trip.
 *
 * The subtlety worth encoding: protocols.md makes `source_date`, `period`, `unit`, `fact_key` and
 * `basis` *required by business validation* for a text PDF, while a CSV carries them per row and
 * must not ask for them. The OpenAPI schema marks all five optional, so the shape alone does not
 * tell you this.
 */

export const ACCEPTED_EXTENSIONS = [".csv", ".pdf"] as const;

/** docs/demo/scenarios.md fixes this header and its order. */
export const CSV_HEADER = ["text", "source_date", "period", "unit", "fact_key", "basis"] as const;

export const CLASSIFICATIONS = ["public", "internal", "restricted"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const BASIS_VALUES = ["actual", "forecast", "proposal", "event"] as const;
export type Basis = (typeof BASIS_VALUES)[number];

export type UploadFormat = "csv" | "pdf" | null;

export type UploadDraft = {
  fileName: string;
  fileSize: number | null;
  classification: string;
  dealId: string;
  sourceDate: string;
  period: string;
  unit: string;
  factKey: string;
  basis: string;
};

export const EMPTY_UPLOAD_DRAFT: UploadDraft = {
  fileName: "",
  fileSize: null,
  classification: "",
  dealId: "",
  sourceDate: "",
  period: "",
  unit: "",
  factKey: "",
  basis: "",
};

/** Extension is a hint for the form; the server inspects content, not the name. */
export function formatOf(fileName: string): UploadFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

/** Attribution fields a text PDF must carry; a CSV derives them from each validated row. */
export const PDF_ATTRIBUTION_FIELDS = ["sourceDate", "period", "unit", "factKey", "basis"] as const;
export type UploadField = keyof UploadDraft;

export type UploadValidation =
  | { ok: true; format: Exclude<UploadFormat, null> }
  | { ok: false; errors: Partial<Record<UploadField, string>> };

export type UploadLimits = {
  /** From active policy when a safe projection exists. Null means "do not promise a limit". */
  maxBytes?: number | null;
};

export function validateUpload(draft: UploadDraft, limits: UploadLimits = {}): UploadValidation {
  const errors: Partial<Record<UploadField, string>> = {};
  const format = formatOf(draft.fileName);

  if (draft.fileName.trim().length === 0) {
    errors.fileName = "Choose a file to upload.";
  } else if (format === null) {
    errors.fileName = "Only a CSV or a text PDF can be uploaded.";
  }

  const { maxBytes } = limits;
  if (
    typeof maxBytes === "number" &&
    maxBytes > 0 &&
    typeof draft.fileSize === "number" &&
    draft.fileSize > maxBytes
  ) {
    errors.fileSize = `This file is larger than the current limit of ${maxBytes} bytes.`;
  }

  if (draft.classification.length === 0) {
    errors.classification = "Choose a classification.";
  } else if (!(CLASSIFICATIONS as readonly string[]).includes(draft.classification)) {
    errors.classification = "Choose a valid classification.";
  }

  // Required by business validation for a text PDF only.
  if (format === "pdf") {
    if (draft.sourceDate.length === 0) errors.sourceDate = "A text PDF needs its source date.";
    if (draft.period.trim().length === 0) errors.period = "A text PDF needs its period.";
    if (draft.unit.trim().length === 0) errors.unit = "A text PDF needs its unit.";
    if (draft.factKey.trim().length === 0) errors.factKey = "A text PDF needs its fact key.";
    if (draft.basis.length === 0) errors.basis = "A text PDF needs its basis.";
    else if (!(BASIS_VALUES as readonly string[]).includes(draft.basis)) {
      errors.basis = "Choose a valid basis.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, format: format as Exclude<UploadFormat, null> };
}

/**
 * Build the multipart body. Only fields the contract accepts are included, and the five
 * attribution fields are sent for a PDF only — a CSV must not appear to declare them.
 *
 * `openapi-fetch` 0.17.0 passes a FormData body through its default serializer and omits
 * Content-Type so the browser sets the multipart boundary, so this needs no custom serializer.
 */
export function buildUploadBody(draft: UploadDraft, file: File | null): FormData {
  const body = new FormData();
  if (file) body.set("file", file);
  body.set("classification", draft.classification);
  if (draft.dealId.trim().length > 0) body.set("deal_id", draft.dealId.trim());

  if (formatOf(draft.fileName) === "pdf") {
    body.set("source_date", draft.sourceDate);
    body.set("period", draft.period.trim());
    body.set("unit", draft.unit.trim());
    body.set("fact_key", draft.factKey.trim());
    body.set("basis", draft.basis);
  }
  return body;
}
