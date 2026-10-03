import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { EXPORT_ROW_CAP, csvCell, exportAudit } from "./auditExport";
import { notExecutedUsage } from "./envelope";
import type { ActivityRow, GatewayDeps, Outcome, RepositoryPort, WindowQuery } from "./ports";

const actor: ActorContext = {
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  role: "analyst",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const admin: ActorContext = { ...actor, role: "admin" };
const NOW = new Date("2026-10-03T14:22:51.000Z");
const DAY = { from: "2026-10-03T00:00:00.000Z", to: "2026-10-03T23:59:59.999Z" };

const row = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  trace_id: "6f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f",
  actor_id: actor.actor_id,
  operation: "chat_start",
  state: "completed",
  decision: "BLOCK",
  reasons: ["policy:blocked", "generation:tool_call_refused"],
  usage: notExecutedUsage("illustrative-v1"),
  policy_version: 1,
  feed_version: 1,
  created_at: "2026-10-03T10:00:00+00:00",
  ...overrides,
});

function setup(rows: ActivityRow[] = [row()]) {
  const queries: WindowQuery[] = [];
  const repository = {
    async exportActivity(input: WindowQuery) {
      queries.push(input);
      return rows;
    },
  } as unknown as RepositoryPort;
  const deps: GatewayDeps = { repository, detection: null, generation: null };
  return { deps, queries };
}

const run = (
  deps: GatewayDeps,
  who: ActorContext,
  params: Partial<{ scope: string; from: string; to: string }> = {},
) => exportAudit(deps, who, { scope: null, from: null, to: null, ...params }, NOW);

const refusal = (result: Outcome | Response) => {
  expect(result).not.toBeInstanceOf(Response);
  const { status, body } = result as Outcome;
  return { status, code: body.error?.code, message: body.error?.message };
};

describe("csvCell", () => {
  it("neutralises formula-leading cells", () => {
    for (const lead of ["=", "+", "-", "@"]) expect(csvCell(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe(`"'\rx"`);
  });

  it("quotes separators and doubles quotes", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(false)).toBe("false");
  });
});

describe("exportAudit", () => {
  it("answers CSV with a trace id, own scope and the current UTC day by default", async () => {
    const { deps, queries } = setup();
    const response = await run(deps, actor);
    expect(response).toBeInstanceOf(Response);
    const res = response as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="audit-own-2026-10-03.csv"');
    expect(queries).toEqual([
      {
        organisationId: actor.organisation_id,
        ownActorId: actor.actor_id,
        ...DAY,
        limit: EXPORT_ROW_CAP + 1,
      },
    ]);

    const [header, line, end] = (await res.text()).split("\r\n");
    expect(header.split(",").slice(0, 7)).toEqual([
      "trace_id",
      "created_at",
      "actor_id",
      "operation",
      "state",
      "decision",
      "reasons",
    ]);
    expect(line.split(",").slice(3, 7)).toEqual([
      "chat_start",
      "completed",
      "BLOCK",
      "policy:blocked;generation:tool_call_refused",
    ]);
    expect(end).toBe("");
  });

  it("gives an admin the organisation, and refuses it to anyone else", async () => {
    const { deps, queries } = setup();
    expect(await run(deps, admin, { scope: "organisation" })).toBeInstanceOf(Response);
    expect(queries[0].ownActorId).toBeNull();

    expect(refusal(await run(deps, actor, { scope: "organisation" }))).toMatchObject({
      status: 403,
      code: "ACCESS_DENIED",
    });
    expect(queries).toHaveLength(1);
  });

  it("refuses an unknown scope and a range beyond one UTC day before reading", async () => {
    const { deps, queries } = setup();
    expect(refusal(await run(deps, actor, { scope: "everyone" })).code).toBe("INVALID_INPUT");
    expect(
      refusal(await run(deps, actor, { from: "2026-10-02T00:00:00Z", to: "2026-10-03T00:00:00Z" })).code,
    ).toBe("INVALID_INPUT");
    expect(queries).toHaveLength(0);
  });

  it("exports exactly the cap and refuses one more with a narrowing instruction", async () => {
    expect(await run(setup(Array(EXPORT_ROW_CAP).fill(row())).deps, actor)).toBeInstanceOf(Response);
    const over = refusal(await run(setup(Array(EXPORT_ROW_CAP + 1).fill(row())).deps, actor));
    expect(over).toMatchObject({ status: 400, code: "INVALID_INPUT" });
    expect(over.message).toContain("1000 rows");
  });

  /*
   * csvCell is tested above; this asserts the mapping applies it to every column, which is where a
   * forgotten field would leak a formula or break the row into two.
   */
  it("neutralises a hostile value in any column, and keeps the row one line", async () => {
    const hostile = row({
      operation: '=HYPERLINK("http://x")',
      state: "-2+3",
      reasons: ["@cmd", 'quote"inside', "with,comma"],
      usage: { ...notExecutedUsage("@rate"), comparison_micro_usd: 0 },
    });
    const res = (await run(setup([hostile]).deps, actor)) as Response;
    const lines = (await res.text()).split("\r\n");
    // Header, one record, trailing newline: a stray CR or LF would show up as a fourth element.
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("'=HYPERLINK");
    expect(lines[1]).toContain("'-2+3");
    expect(lines[1]).toContain("'@cmd");
    // Joined first, then neutralised once and quoted: one cell, not three columns.
    expect(lines[1]).toContain('"\'@cmd;quote""inside;with,comma"');
    // The rate version is a stored string too, so it goes through the same gate.
    expect(lines[1]).toContain("'@rate");
  });

  it("withholds the whole file when one row breaks the contract", async () => {
    const { deps } = setup([row(), row({ policy_version: null })]);
    expect(refusal(await run(deps, actor))).toMatchObject({ status: 503, code: "STATE_UNAVAILABLE" });
  });
});
