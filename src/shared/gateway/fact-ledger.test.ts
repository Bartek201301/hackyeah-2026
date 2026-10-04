import { expect, it } from "vitest";
import type { PermittedExcerpt } from "./ports";
import { completeRequestedFacts } from "./fact-ledger";

const fact = (
  id: string,
  text: string,
  basis: PermittedExcerpt["basis"],
  fact_key: string,
): PermittedExcerpt => ({
  id,
  version: 1,
  text,
  classification: "restricted",
  locator: "row:1",
  source_date: "2026-04-02",
  period: "FY2026",
  unit: "USD million",
  basis,
  fact_key,
  source_label: id,
});

it("fills a missing forecast from permitted source facts with its citation", () => {
  const rows = [
    fact("forecast", "AsterCloud FY2026 revenue forecast is USD 164 million.", "forecast", "revenue"),
    fact("bid", "AsterCloud bid ceiling is USD 640 million.", "proposal", "bid_ceiling"),
  ];
  const answer = completeRequestedFacts(
    "The bid ceiling is USD 640 million [S2].",
    "Brief me on the revenue forecast and bid ceiling.",
    rows,
  );
  expect(answer).toContain("USD 164 million [S1]");
  expect(answer.match(/USD 640 million/g)).toHaveLength(1);
});

it("states when a requested figure is absent from permitted context", () => {
  const rows = [fact("bid", "AsterCloud bid ceiling is USD 640 million.", "proposal", "bid_ceiling")];
  const answer = completeRequestedFacts(
    "The bid ceiling is USD 640 million [S1].",
    "Give the forecast and bid ceiling.",
    rows,
  );
  expect(answer).toContain("Forecast: no citable figure was available");
  expect(answer).not.toContain("Bid ceiling: no citable figure");
});
