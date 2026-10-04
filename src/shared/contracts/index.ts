// Shared gateway contract. Types only: schema-derived aliases plus the internal ports
// from docs/contracts/protocols.md ("Shared internal interfaces (T01)").
import type { components } from "./openapi.gen";

export type { paths, components, operations } from "./openapi.gen";

type Schemas = components["schemas"];

export type Decision = Schemas["Decision"];
export type Usage = Schemas["Usage"];
export type Citation = Schemas["Citation"];
export type Excerpt = Schemas["Excerpt"];
export type Finding = Schemas["Finding"];
export type Assessment = Schemas["Assessment"];
export type SecurityVerdict = Schemas["SecurityVerdict"];
export type ChatCheck = Schemas["ChatCheck"];
export type Run = Schemas["Run"];
export type Review = Schemas["Review"];
export type ApiResponse = Schemas["Response"];
export type AuditProjection = Schemas["AuditProjection"];
export type SearchRequest = Schemas["SearchRequest"];
export type ActionRequest = Schemas["ActionRequest"];
export type ChatRequest = Schemas["ChatRequest"];
export type ExportRequest = Schemas["ExportRequest"];
export type ReviewRequest = Schemas["ReviewRequest"];
export type PolicyUpdate = Schemas["PolicyUpdate"];
export type FeedUpdate = Schemas["FeedUpdate"];
export type SourceRequest = Schemas["SourceRequest"];
export type ConnectorImport = Schemas["ConnectorImport"];
export type SourceSummary = Schemas["SourceSummary"];
export type ImportSummary = Schemas["ImportSummary"];
export type Metrics = Schemas["Metrics"];
export type Client = Schemas["Client"];
export type ClientCreate = Schemas["ClientCreate"];
export type ClientUpdate = Schemas["ClientUpdate"];

export type GatewayPolicy = PolicyUpdate["policy"];
export type ThreatFeed = FeedUpdate["feed"];
export type ErrorCode = NonNullable<ApiResponse["error"]>["code"];

/** Constructed only by trusted server authentication. */
export type ActorContext = {
  actor_id: string;
  organisation_id: string;
  role: "admin" | "analyst" | "employee" | "external";
  deal_ids: readonly string[];
  audience: "actor" | "public";
  scopes: readonly string[];
};
export type ParsedUnit = {
  text: string;
  locator: string;
  start_char: number;
  end_char: number;
};
export type ParsedDocument = {
  units: ParsedUnit[];
  text_sha256: string;
  text_chars: number;
  complete: boolean;
  format: "csv" | "pdf" | "dataset";
};
export type ToolCall = {
  id: string;
  name: "search_excerpts" | "read_excerpt";
  arguments: Record<string, unknown>;
};
export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type RegisteredTool = {
  name: ToolCall["name"];
  description: string;
  input_schema: object;
};
export type GenerationResult = {
  text: string;
  tool_calls: ToolCall[];
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  model_digest: string;
  finished: boolean;
};
export interface DetectionPort {
  parse(
    input: { bytes: Uint8Array; format: "csv" | "pdf" },
    limits: GatewayPolicy["imports"],
    signal: AbortSignal,
  ): Promise<ParsedDocument>;
  assess(
    input: { call_id: string; text: string; operation: string; audience: "actor" | "public" },
    policy: GatewayPolicy,
    signal: AbortSignal,
  ): Promise<{
    findings: Finding[];
    semantic: Assessment;
    semantic_input_tokens: number | null;
    semantic_ms: number;
  }>;
}
export interface GenerationPort {
  generate(
    input: {
      call_id: string;
      messages: readonly ModelMessage[];
      tools: readonly RegisteredTool[];
      limits: GatewayPolicy["execution"];
      /** Fixed internal rubric/schema; never taken from a public request. */
      purpose?: "security_verification_v1";
    },
    signal: AbortSignal,
  ): Promise<GenerationResult>;
}
