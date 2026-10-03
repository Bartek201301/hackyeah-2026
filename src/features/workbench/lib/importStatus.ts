/*
 * Import status and classification are independent dimensions and get separate visible labels.
 *
 * docs/product/technical-spec.md §4: "classification is separate from processing status". An
 * approved document is not public, and a restricted document is not unprocessed. Collapsing the two
 * into one badge is how a demo accidentally claims a restricted file was published.
 */
import type { ImportSummary, SourceSummary } from "@/shared/contracts";
import type { OutcomeTone } from "./envelope";

export type ImportStatus = ImportSummary["status"];
export type Classification = ImportSummary["classification"];

export type StatusView = { label: string; tone: OutcomeTone; detail: string };

const STATUS: Record<ImportStatus, StatusView> = {
  quarantined: {
    label: "Quarantined",
    tone: "neutral",
    detail: "The original is stored privately and has not been processed yet.",
  },
  processing: {
    label: "Processing",
    tone: "brand",
    detail: "The gateway is parsing and assessing the accepted text.",
  },
  approved: {
    label: "Approved",
    tone: "success",
    detail: "Checked excerpts were published at this document's classification.",
  },
  partial: {
    label: "Partially published",
    tone: "warning",
    detail: "Some units were removed. Only the checked remainder was published.",
  },
  review: {
    label: "Held for review",
    tone: "warning",
    detail: "Separation was uncertain, so an administrator must review the candidate.",
  },
  blocked: {
    label: "Blocked",
    tone: "danger",
    detail: "Nothing was published from this document.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    detail: "Processing did not finish. Nothing was published.",
  },
};

const CLASSIFICATION: Record<Classification, StatusView> = {
  public: {
    label: "Public",
    tone: "neutral",
    detail: "May appear in a public summary once approved.",
  },
  internal: {
    label: "Internal",
    tone: "brand",
    detail: "Available to signed-in accounts in this organisation.",
  },
  restricted: {
    label: "Restricted",
    tone: "danger",
    detail: "Available only to accounts assigned to its deal.",
  },
};

export const describeImportStatus = (status: ImportStatus): StatusView => STATUS[status];
export const describeClassification = (c: Classification): StatusView => CLASSIFICATION[c];

export const describeSourceKind = (kind: SourceSummary["kind"]): string =>
  kind === "dataset" ? "Configured dataset" : "Upload";

/**
 * Whether this import produced something a requester can expect to find in search.
 * `partial` counts: the checked remainder really was published.
 */
export const isPublished = (status: ImportStatus): boolean => status === "approved" || status === "partial";

/** A terminal import needs no further polling. */
export const isTerminalImport = (status: ImportStatus): boolean =>
  status !== "quarantined" && status !== "processing";
