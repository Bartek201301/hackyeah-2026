import "server-only";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import api from "../../../docs/contracts/openapi.json";
import policySchema from "../../../docs/contracts/policy.schema.json";
import feedSchema from "../../../docs/contracts/threat-feed.schema.json";
import type { GatewayPolicy, ThreatFeed, components } from "./index";

// JSON Schema only. Policy business validation (thresholds, ceilings) is T07.

type Schemas = components["schemas"] & { GatewayPolicy: GatewayPolicy; ThreatFeed: ThreatFeed };
export type SchemaName = Exclude<keyof Schemas, "policy.schema" | "threat-feed.schema">;
export type CheckResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const OPENAPI_ID = "https://ai-control-gateway.example/schemas/openapi";
const $defs = JSON.parse(
  JSON.stringify(api.components.schemas)
    .replaceAll("#/components/schemas/", "#/$defs/")
    .replaceAll("./policy.schema.json", policySchema.$id)
    .replaceAll("./threat-feed.schema.json", feedSchema.$id),
);

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(policySchema).addSchema(feedSchema).addSchema({ $id: OPENAPI_ID, $defs });

const schemaRef = (name: SchemaName) =>
  name === "GatewayPolicy"
    ? policySchema.$id
    : name === "ThreatFeed"
      ? feedSchema.$id
      : `${OPENAPI_ID}#/$defs/${name}`;

export function check<N extends SchemaName>(name: N, value: unknown): CheckResult<Schemas[N]> {
  const validate = ajv.getSchema(schemaRef(name));
  if (!validate) throw new Error(`Unknown contract schema: ${name}`);
  if (validate(value)) return { ok: true, value: value as Schemas[N] };
  // Paths and messages only: never echo input values (no raw protected text in logs).
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`),
  };
}
