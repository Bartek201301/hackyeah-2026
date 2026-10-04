/*
 * W5 public summary: requesting an export run, and offering its download when one is released.
 *
 * Scope is the contract as it stands (B16, answered by Bartosz): a completed export returns
 * `{download_path, expires_at}` and nothing else. There is no summary preview and no citation list
 * here — the checked text lives inside the PDF, which the gateway generated and scanned. Showing a
 * "preview" assembled in the browser would be a second, unchecked copy of the answer.
 *
 * `download_path` is treated as opaque: the screen does not parse it, build on it or guess an id
 * from it. It only refuses anything that is not a same-origin absolute path, because an
 * off-origin link from a response is how a download turns into an exfiltration route.
 */
import type { ApiResponse, Run } from "@/shared/contracts";
import {
  classifyResponse,
  classifyTerminalErrorCode,
  type GatewayOutcome,
  type OutcomeKind,
} from "./envelope";
import { readRun } from "./chatData";
import { describeRun, isTerminalRunState } from "./runState";

type Data = ApiResponse["data"];

/** Matches ExportRequest.topic in the contract. */
export const MAX_TOPIC = 1000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A run of the kind this screen started, so it cannot poll a chat run into an export card. */
export const readExportRun = (data: Data): Run | null => {
  const run = readRun(data);
  return run && run.kind === "export" ? run : null;
};

export type ExportReady = { downloadPath: string; expiresAt: string };

/**
 * A same-origin absolute path, and nothing else.
 *
 * protocols.md: "Download path is an authenticated gateway path, not a public Storage URL." A
 * leading `//` is protocol-relative and would leave the origin, so it is refused along with any
 * absolute URL.
 *
 * `/\\host` is refused for the same reason: browsers normalise a backslash to a forward slash when
 * resolving a URL, so it resolves exactly like `//host` and leaves the origin while still passing a
 * naive "starts with a single slash" check.
 */
export function isGatewayDownloadPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  const separator = value[1];
  return separator !== "/" && separator !== "\\";
}

/** Narrow a completed export payload. Rejects a chat answer, a review or an off-origin link. */
export function readExportReady(data: Data): ExportReady | null {
  const o: unknown = data;
  if (!isRecord(o)) return null;
  const { download_path, expires_at } = o;
  if (!isGatewayDownloadPath(download_path)) return null;
  if (typeof expires_at !== "string" || Number.isNaN(Date.parse(expires_at))) return null;
  return { downloadPath: download_path, expiresAt: expires_at };
}

/** The expiry as a UTC instant. Machine-readable: it belongs in `<time dateTime>`, not on screen. */
export const expiryInstant = (expiresAt: string): string | null => {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * The expiry as a reader sees it: short, in their own zone, **with the zone named**.
 *
 * DESIGN.md allows a timestamp to be labelled UTC or localized with its zone, and forbids neither
 * more nor less: a bare local time is the one thing that is wrong, because a deadline read in the
 * wrong zone is a download someone thinks they still have. `timeZone` is for tests; the app passes
 * nothing and gets the reader's own. The month is a name, so 04/10 is never read as 10 April.
 */
export const expiryLabel = (expiresAt: string, timeZone?: string): string | null => {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(t));
};

export const hasExpired = (expiresAt: string, now: number = Date.now()): boolean => {
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) ? true : t <= now;
};

export type TopicValidation = { ok: true; topic: string } | { ok: false; error: string };

/** A courtesy check only: the gateway validates and decides. */
export function validateTopic(raw: string): TopicValidation {
  const topic = raw.trim();
  if (topic.length === 0) return { ok: false, error: "Enter a topic for the summary." };
  if (topic.length > MAX_TOPIC)
    return { ok: false, error: `Shorten the topic to ${MAX_TOPIC} characters or fewer.` };
  return { ok: true, topic };
}

/** Terminal run states that release nothing, and the outcome kind each maps to. */
const WITHHELD: Partial<Record<Run["state"], OutcomeKind>> = {
  review: "review",
  blocked: "denied",
  failed: "failed",
  cancelled: "cancelled",
  incomplete: "incomplete",
};

/** `run` is the export run still in flight, or null once this response ended the lifecycle;
 * see ChatClassification for why polling, Cancel and the progress badge all hang off it. */
export type ExportClassification = { outcome: GatewayOutcome; run: Run | null };

/**
 * Classify any export-lifecycle response, in the same order as chat: a terminal error code first, a
 * run still in flight as progress, a run that ended without releasing as its own state, and
 * everything else — including a completed `{download_path, expires_at}` — through the generic
 * classifier, which gates on the decision.
 *
 * Without this, a pending run (200 with `decision: null` by contract) would read as a fail-closed
 * service error on every poll.
 */
export function classifyExportResponse(status: number, body: ApiResponse | null): ExportClassification {
  const run = readExportRun(body?.data ?? null);

  const terminal = classifyTerminalErrorCode(body);
  if (terminal) return { outcome: terminal, run: null };

  if (run && (status === 200 || status === 202)) {
    const described = describeRun(run);
    const common = {
      reasons: body?.reasons ?? [],
      decision: body?.decision ?? null,
      errorCode: body?.error?.code ?? null,
      traceId: body?.trace_id ?? null,
      showsResult: false,
      retryable: false,
    };
    if (!isTerminalRunState(run.state)) {
      return {
        outcome: {
          ...common,
          kind: "progress",
          title: described.label,
          detail: described.detail,
          tone: "brand",
        },
        run,
      };
    }
    const withheldKind = WITHHELD[run.state];
    if (withheldKind) {
      return {
        outcome: {
          ...common,
          kind: withheldKind,
          title: described.label,
          detail: described.detail,
          tone: described.tone,
        },
        run: null,
      };
    }
  }

  const generic = classifyResponse(status, body);
  /*
   * A released export is a file, not an answer.
   *
   * The generic classifier speaks for chat ("Answer ready — the gateway checked this answer before
   * releasing it"), and the card below already announces the summary, so the two headings read as
   * two separate events. This keeps the trace link and the decision, and says only what the notice
   * is for: the checks passed, and the file is below.
   *
   * It deliberately promises nothing about coverage. A topic the public sources do not cover
   * produces a checked summary that says so, with no citations, and the response carries neither
   * the citation count nor the text, so this screen cannot tell the two apart. The card says that
   * out loud instead of implying every released summary cites something.
   */
  if (generic.kind === "result" && generic.decision === "ALLOW") {
    return {
      outcome: {
        ...generic,
        title: "Summary released",
        detail: "The gateway checked the summary before storing it. The file itself is below.",
      },
      run: null,
    };
  }
  return { outcome: generic, run: null };
}
