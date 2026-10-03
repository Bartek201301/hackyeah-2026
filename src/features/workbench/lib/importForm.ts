/*
 * Upload form rules for `POST /imports/upload`.
 *
 * These are usability checks only. docs/product/technical-spec.md §4 puts the real decisions on the
 * server: it counts bytes, inspects content rather than the file name, enforces role, deal and
 * classification, scans the complete text and controls publication. A browser check on a filename
 * proves nothing — its only job is to stop an obvious mistake before a pointless round trip.
 *
 * CSV only: the demo build refuses a PDF (`UNSUPPORTED_FILE`), so the five attribution fields a
 * text PDF used to need are gone from this form. A CSV carries them per row, and `startUpload`
 * rejects the request outright if they are sent, so sending them is not a harmless extra.
 */

export const ACCEPTED_EXTENSIONS = [".csv"] as const;

/** docs/demo/scenarios.md fixes this header and its order. */
export const CSV_HEADER = ["text", "source_date", "period", "unit", "fact_key", "basis"] as const;

export const CLASSIFICATIONS = ["public", "internal", "restricted"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export type UploadFormat = "csv" | "pdf" | null;

/** The server's own sentence for a PDF, so the form and the gateway say the same thing. */
export const PDF_UNAVAILABLE = "PDF import is not available in this demo build; upload a CSV.";

export type UploadDraft = {
  fileName: string;
  fileSize: number | null;
  classification: string;
  dealId: string;
};

export const EMPTY_UPLOAD_DRAFT: UploadDraft = {
  fileName: "",
  fileSize: null,
  classification: "",
  dealId: "",
};

/**
 * Extension is a hint for the form; the server inspects content, not the name.
 *
 * `pdf` is still recognised although it is refused: naming the reason is more useful than "only a
 * CSV can be uploaded", and it is the same reason the server would give after the round trip.
 */
export function formatOf(fileName: string): UploadFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

export type UploadField = keyof UploadDraft;

export type UploadValidation =
  { ok: true; format: "csv" } | { ok: false; errors: Partial<Record<UploadField, string>> };

export type UploadLimits = {
  /** From active policy when a safe projection exists. Null means "do not promise a limit". */
  maxBytes?: number | null;
};

export function validateUpload(draft: UploadDraft, limits: UploadLimits = {}): UploadValidation {
  const errors: Partial<Record<UploadField, string>> = {};
  const format = formatOf(draft.fileName);

  if (draft.fileName.trim().length === 0) {
    errors.fileName = "Choose a CSV file to upload.";
  } else if (format === "pdf") {
    errors.fileName = PDF_UNAVAILABLE;
  } else if (format === null) {
    errors.fileName = "Only a CSV can be uploaded.";
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

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, format: "csv" };
}

/**
 * Build the multipart body: the file, its classification, and a deal id only when one was chosen.
 *
 * Nothing else. `startUpload` refuses a CSV that carries `source_date`, `period`, `unit`,
 * `fact_key` or `basis`, so an extra field here is a failed upload, not a tolerated one.
 *
 * `openapi-fetch` 0.17.0 passes a FormData body through its default serializer and omits
 * Content-Type so the browser sets the multipart boundary, so this needs no custom serializer.
 */
export function buildUploadBody(draft: UploadDraft, file: File | null): FormData {
  const body = new FormData();
  if (file) body.set("file", file);
  body.set("classification", draft.classification);
  if (draft.dealId.trim().length > 0) body.set("deal_id", draft.dealId.trim());
  return body;
}
