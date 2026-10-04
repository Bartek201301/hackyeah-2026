import "server-only";
import type { PermittedExcerpt } from "./ports";

const AMOUNT = /\bUSD\s+\d+(?:[.,]\d+)?\s*(?:million|billion|thousand)?\b/i;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Fact = { tag: string; amount: string; label: string };

/** Derived only from the already projected, permitted context; no model assertion becomes a fact. */
function requestedFacts(question: string, rows: readonly PermittedExcerpt[]): Fact[] {
  const q = question.toLowerCase();
  const wantsBid = /\bbid\b|\bceiling\b/.test(q);
  const wantsForecast = /\bforecast\b/.test(q);
  const wantsRevenue = /\brevenue\b/.test(q);
  return rows.flatMap((row, index) => {
    const amount = row.text.match(AMOUNT)?.[0];
    if (!amount) return [];
    const key = row.fact_key?.toLowerCase() ?? "";
    const bid = wantsBid && (key.includes("bid") || /\bbid\b/i.test(row.text));
    const forecast = wantsForecast && row.basis === "forecast" && (!wantsRevenue || key.includes("revenue"));
    const actual = wantsRevenue && row.basis === "actual" && key.includes("revenue");
    if (!bid && !forecast && !actual) return [];
    const label = bid ? "bid ceiling" : forecast ? "revenue forecast" : "revenue actual";
    return [{ tag: `[S${index + 1}]`, amount, label: `${row.period} ${label}` }];
  });
}

/** Adds missing, attributable source facts before the normal citation and output checks. */
export function completeRequestedFacts(
  answer: string,
  question: string,
  rows: readonly PermittedExcerpt[],
): string {
  const facts = requestedFacts(question, rows);
  const missing = facts.filter((fact) => {
    const paired = new RegExp(`${escape(fact.amount)}[^.!?\\n]{0,120}${escape(fact.tag)}`, "i");
    return !paired.test(answer);
  });
  const q = question.toLowerCase();
  const unavailable = [
    {
      asked: /\bforecast\b/.test(q),
      present: facts.some((fact) => fact.label.includes("forecast")),
      label: "Forecast",
    },
    {
      asked: /\bbid\b|\bceiling\b/.test(q),
      present: facts.some((fact) => fact.label.includes("bid")),
      label: "Bid ceiling",
    },
  ].filter(
    (part) =>
      part.asked &&
      !part.present &&
      !new RegExp(`${part.label}[^.!?]{0,80}(?:unavailable|not available|not found|unknown)`, "i").test(
        answer,
      ),
  );
  if (!missing.length && !unavailable.length) return answer;
  const factsLine = missing.length
    ? `Source facts: ${missing.map((fact) => `${fact.label}: ${fact.amount} ${fact.tag}`).join("; ")}.`
    : "";
  const unavailableLine = unavailable
    .map((part) => `${part.label}: no citable figure was available in the retrieved permitted sources.`)
    .join(" ");
  return [answer.trim(), factsLine, unavailableLine].filter(Boolean).join("\n");
}
