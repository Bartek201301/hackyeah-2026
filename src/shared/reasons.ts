/*
 * Plain-English labels for the codes the gateway stores: reason codes, finding codes, operation and
 * stage names. Presentation only. The raw code stays the evidence, so screens keep it in a tooltip or
 * beside the label, and an unknown code falls back to itself: a code is never dropped or reworded
 * into something it does not say.
 */

export type ReasonTone = "danger" | "warning" | "neutral";
export type ReasonLabel = { label: string; tone: ReasonTone };

const FINDINGS: Record<string, string> = {
  "SIG-001": "Known prompt-injection pattern (SIG-001)",
  "SIG-002": "Known data-exfiltration address (SIG-002)",
  PEM_KEY: "Private key detected",
  SECRET_TOKEN: "Secret token or API key detected",
  CONTACT_EMAIL: "Personal email address detected",
};

/** Where a `<stage>_signature:<code>` match was found. The question is the default subject. */
const SIGNATURE_WHERE: Record<string, string> = {
  input: "",
  output: " in the proposed answer",
  client: " in the client details",
  import: " in the uploaded file",
};

const RISKS: Record<string, string> = {
  instruction_manipulation: "attempt to override instructions",
  sensitive_exposure: "could expose data beyond this account's access",
  resource_abuse: "attempt to run up cost or loop the system",
};

const FIXED: Record<string, ReasonLabel> = {
  "semantic:review_required": { label: "AI check: a person must review this", tone: "warning" },
  "verification:uncertain": {
    label: "Second AI check (Qwen) was unsure, so a person decides",
    tone: "warning",
  },
  "citation:missing": { label: "Answer cited no permitted source", tone: "warning" },
  "citation:unknown_source": { label: "Answer cited a source it was not given", tone: "warning" },
  "citation:access_revoked": { label: "Access to a cited source ended before release", tone: "danger" },
  "import:invalid_csv": { label: "File is not valid CSV", tone: "warning" },
  "import:too_many_rows": { label: "File has more rows than allowed", tone: "warning" },
  "import:invalid_row": { label: "File has a row that is not valid", tone: "warning" },
  "import:audience_unverified": {
    label: "Audience could not be verified, so a person decides",
    tone: "warning",
  },
  "import:assessment_clean": { label: "Import passed the AI check", tone: "neutral" },
  "export:unavailable": { label: "PDF not available to this account", tone: "danger" },
  "excerpt:unavailable": { label: "Excerpt not available to this account", tone: "danger" },
  "client:unavailable": { label: "Client not available to this account", tone: "danger" },
  "review:unavailable": { label: "Review case not available to this account", tone: "danger" },
  "action:role_not_permitted": { label: "This role cannot do that", tone: "danger" },
  "action:change_exceeds_role_limit": { label: "Change exceeds this role's approval limit", tone: "warning" },
  "action:destructive_requires_approval": {
    label: "Destructive actions need a second person",
    tone: "warning",
  },
  "action:invalid_fee": { label: "Fee is not a valid amount", tone: "danger" },
  "action:duplicate_client": {
    label: "A client with this name already exists, so a person decides",
    tone: "warning",
  },
  "action:unparsed": { label: "Request could not be read as a client action", tone: "warning" },
  "action:client_not_resolved": { label: "Client could not be identified", tone: "warning" },
  "generation:tool_call_refused": { label: "Model asked for a tool it may not use", tone: "danger" },
  "tool:search_excerpts": { label: "Searched permitted excerpts", tone: "neutral" },
  "policy:blocked": { label: "Blocked by the active policy", tone: "danger" },
  "reconcile:charged_conservatively": {
    label: "Usage was not reported, so the full reservation was charged",
    tone: "neutral",
  },
  // Error codes, which a client notice lists beside the reasons.
  INVALID_INPUT: { label: "Input was not valid", tone: "warning" },
  UNAUTHENTICATED: { label: "Session ended; sign in again", tone: "warning" },
  ACCESS_DENIED: { label: "Not permitted for this account", tone: "danger" },
  NOT_FOUND: { label: "Not found or not available to this account", tone: "warning" },
  CONFLICT: { label: "Changed by someone else since it was loaded", tone: "warning" },
  RATE_LIMITED: { label: "Too many requests; try again shortly", tone: "warning" },
  BUDGET_EXHAUSTED: { label: "Budget for this period is used up", tone: "danger" },
  POLICY_UNAVAILABLE: { label: "Policy could not be loaded, so nothing was done", tone: "warning" },
  SEMANTIC_UNAVAILABLE: { label: "Required AI check (Laya) was unavailable", tone: "warning" },
  MODEL_UNAVAILABLE: { label: "Model was unavailable", tone: "warning" },
  AUDIT_UNAVAILABLE: { label: "Audit record could not be written, so nothing was released", tone: "warning" },
  STATE_UNAVAILABLE: { label: "Gateway state was unavailable, so nothing was done", tone: "warning" },
  UNSUPPORTED_FILE: { label: "File type is not supported", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  INCOMPLETE: { label: "Did not complete", tone: "warning" },
};

function describeFinding(code: string): string | null {
  return FINDINGS[code] ?? (/^SIG-\d+$/.test(code) ? `Known threat-feed pattern (${code})` : null);
}

export function describeReason(code: string): ReasonLabel {
  const fixed = FIXED[code];
  if (fixed) return fixed;

  const finding = describeFinding(code);
  if (finding) return { label: finding, tone: "danger" };

  const [family, rest = ""] = code.split(/:(.*)/);
  const signature = family.match(/^(input|output|client|import)_signature$/);
  if (signature) {
    const label = describeFinding(rest);
    if (label) return { label: `${label}${SIGNATURE_WHERE[signature[1]]}`, tone: "danger" };
  }
  if (family === "semantic" && RISKS[rest]) return { label: `AI check: ${RISKS[rest]}`, tone: "danger" };
  if (family === "verification" && RISKS[rest])
    return { label: `Second AI check (Qwen) confirmed the risk: ${RISKS[rest]}`, tone: "danger" };

  return { label: code, tone: "neutral" };
}

const OPERATIONS: Record<string, string> = {
  chat_start: "Question",
  action_start: "Client action from chat",
  export_start: "Public PDF summary",
  export_download: "PDF download",
  import_upload: "File upload",
  import_connector: "Connector import",
  import: "Import",
  client_create: "New client",
  client_update: "Client change",
  client_delete: "Client deletion",
  client_list: "Client list",
  client_action: "Client action",
  audit_export: "Audit CSV export",
  audit_list: "Activity list",
  audit_read: "Trace view",
  metrics_read: "Dashboard figures",
  excerpt_search: "Excerpt search",
  excerpt_read: "Excerpt view",
  review_list: "Review queue",
  review_read: "Review case",
  policy_update: "Policy change",
  feed_update: "Threat feed change",
  run_execute: "Background run",
  run_cancel: "Run cancellation",
};

export function describeOperation(operation: string): string {
  return OPERATIONS[operation] ?? operation;
}

const STAGES: Record<string, string> = {
  access: "the access check",
  validate: "input validation",
  input_signature: "the known-pattern check on the question",
  input_semantic: "the AI check on the question",
  chat_input: "the AI check on the question",
  retrieval: "retrieval",
  generation: "answer generation",
  citations: "the citation check",
  output_signature: "the known-pattern check on the answer",
  output_semantic: "the AI check on the answer",
  chat_output: "the AI check on the answer",
  access_recheck: "the final access re-check",
  publication: "publication",
  publish: "publication",
  action_plan: "action planning",
  client_action: "the client rules check",
  client_signature: "the known-pattern check on the client details",
  import_signature: "the known-pattern check on the file",
  import_semantic: "the AI check on the file",
  export_input: "the AI check on the export request",
  export_output: "the AI check on the PDF content",
};

/** A stage name in words, for "refused at …". Unknown stages read as their own words. */
export function describeStage(stage: string): string {
  return STAGES[stage] ?? stage.replaceAll("_", " ");
}
