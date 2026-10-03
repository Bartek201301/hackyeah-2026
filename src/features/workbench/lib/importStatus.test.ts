import { describe, expect, it } from "vitest";
import type { ImportSummary } from "@/shared/contracts";
import {
  describeClassification,
  describeImportStatus,
  describeSourceKind,
  isPublished,
  isTerminalImport,
} from "./importStatus";

const STATUSES: ImportSummary["status"][] = [
  "quarantined",
  "processing",
  "approved",
  "partial",
  "review",
  "blocked",
  "failed",
];

describe("describeImportStatus", () => {
  it("covers every contract status with a label and detail", () => {
    for (const s of STATUSES) {
      const v = describeImportStatus(s);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });

  it("does not describe a blocked or failed import as publishing anything", () => {
    for (const s of ["blocked", "failed"] as const) {
      expect(describeImportStatus(s).detail).toMatch(/nothing was published/i);
      expect(isPublished(s)).toBe(false);
    }
  });

  it("treats partial as genuinely published, not as a failure", () => {
    expect(isPublished("partial")).toBe(true);
    expect(describeImportStatus("partial").label).toMatch(/partially published/i);
  });

  it("says the original stays private while quarantined", () => {
    expect(describeImportStatus("quarantined").detail).toMatch(/stored privately/i);
  });
});

describe("classification is a separate dimension from status", () => {
  it("labels each classification distinctly from any status label", () => {
    const statusLabels = STATUSES.map((s) => describeImportStatus(s).label);
    for (const c of ["public", "internal", "restricted"] as const) {
      const label = describeClassification(c).label;
      expect(label.length).toBeGreaterThan(0);
      expect(statusLabels).not.toContain(label);
    }
  });

  it("marks restricted as deal-scoped rather than merely sensitive", () => {
    expect(describeClassification("restricted").detail).toMatch(/assigned to its deal/i);
  });

  it("does not imply an approved document is public", () => {
    expect(describeImportStatus("approved").detail).not.toMatch(/\bpublic\b/i);
  });
});

describe("polling and source kind", () => {
  it("keeps polling only while work is in flight", () => {
    expect(isTerminalImport("quarantined")).toBe(false);
    expect(isTerminalImport("processing")).toBe(false);
    for (const s of ["approved", "partial", "review", "blocked", "failed"] as const) {
      expect(isTerminalImport(s)).toBe(true);
    }
  });

  it("names both source kinds", () => {
    expect(describeSourceKind("dataset")).toMatch(/dataset/i);
    expect(describeSourceKind("upload")).toMatch(/upload/i);
  });
});
