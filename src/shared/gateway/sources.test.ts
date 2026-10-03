import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import type { GatewayDeps, ImportRow, RepositoryPort, SourceRow } from "./ports";
import { importScope, LIST_LIMIT, listImports, listSources, sourceScope } from "./sources";

const DEAL_A = "11111111-1111-4111-8111-111111111111";
const DEAL_B = "22222222-2222-4222-8222-222222222222";

const actorOf = (role: ActorContext["role"], deal_ids: string[] = []): ActorContext => ({
  actor_id: "0c7e1b2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d",
  organisation_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  role,
  deal_ids,
  audience: "actor",
  scopes: [],
});

const row = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: "33333333-3333-4333-8333-333333333333",
  label: "AsterCloud public filings",
  classification: "public",
  kind: "dataset",
  ...over,
});

// TEST FAKE: unit tests only; the app never composes these.
const deps = (rows: SourceRow[], seen: { limit?: number } = {}): GatewayDeps => {
  const repository: Pick<RepositoryPort, "listSources"> = {
    async listSources(_actor, limit) {
      seen.limit = limit;
      return rows;
    },
  };
  // Only listSources is reachable from this engine; the rest of the port is never called.
  return { repository: repository as RepositoryPort, detection: null, generation: null };
};

describe("sourceScope — what each role may see listed", () => {
  it("shows an administrator every classification in the organisation", () => {
    expect(sourceScope(actorOf("admin", [DEAL_A]))).toEqual({
      classifications: ["public", "internal", "restricted"],
      // No deal branch: the classification set already covers the whole organisation.
      dealIds: [],
    });
  });

  it("gives an analyst restricted sources only for assigned deals", () => {
    expect(sourceScope(actorOf("analyst", [DEAL_A, DEAL_B]))).toEqual({
      classifications: ["public", "internal"],
      dealIds: [DEAL_A, DEAL_B],
    });
  });

  it("gives an analyst with no assigned deal no restricted branch at all", () => {
    expect(sourceScope(actorOf("analyst")).dealIds).toEqual([]);
  });

  it("never gives an employee a restricted branch, even with a deal id present", () => {
    // An employee cannot hold a deal membership; if a record ever said otherwise, the list must not widen.
    expect(sourceScope(actorOf("employee", [DEAL_A]))).toEqual({
      classifications: ["public", "internal"],
      dealIds: [],
    });
  });

  it("limits an external reviewer to public", () => {
    expect(sourceScope(actorOf("external", [DEAL_A]))).toEqual({
      classifications: ["public"],
      dealIds: [],
    });
  });

  it("drops a deal id that is not a uuid before it reaches the filter", () => {
    const scope = sourceScope(actorOf("analyst", [DEAL_A, "restricted,deal_id.not.is.null"]));
    expect(scope.dealIds).toEqual([DEAL_A]);
  });
});

describe("listSources", () => {
  it("asks the repository for at most the contract's 50 rows", async () => {
    const seen: { limit?: number } = {};
    await listSources(deps([], seen), actorOf("employee"));
    expect(seen.limit).toBe(LIST_LIMIT);
    expect(LIST_LIMIT).toBe(50);
  });

  it("returns a contract-valid envelope with exactly the projected fields", async () => {
    const outcome = await listSources(
      deps([row({ classification: "internal", kind: "upload" })]),
      actorOf("analyst", [DEAL_A]),
    );
    expect(outcome.status).toBe(200);
    expect(check("Response", outcome.body)).toEqual({ ok: true, value: outcome.body });
    expect(outcome.body.data).toEqual({
      items: [
        {
          id: row().id,
          label: row().label,
          classification: "internal",
          kind: "upload",
        },
      ],
    });
  });

  it("copies no column the projection does not name", async () => {
    const extra = { ...row(), deal_id: DEAL_A, dataset_key: "aster-public" } as SourceRow;
    const outcome = await listSources(deps([extra]), actorOf("admin"));
    expect(JSON.stringify(outcome.body.data)).not.toContain(DEAL_A);
    expect(JSON.stringify(outcome.body.data)).not.toContain("aster-public");
  });

  it("withholds the whole list when one row cannot be mapped", async () => {
    const outcome = await listSources(deps([row(), row({ id: "not-a-uuid" })]), actorOf("employee"));
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("STATE_UNAVAILABLE");
    // Never partial: the one good row is not released either.
    expect(outcome.body.data).toBeNull();
  });

  it("returns an empty list rather than an error when nothing is visible", async () => {
    const outcome = await listSources(deps([]), actorOf("external"));
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toEqual({ items: [] });
  });
});

const RUN = "44444444-4444-4444-8444-444444444444";

const importRow = (over: Partial<ImportRow> = {}): ImportRow => ({
  id: "55555555-5555-4555-8555-555555555555",
  run_id: RUN,
  status: "approved",
  classification: "internal",
  ...over,
});

// TEST FAKE: unit tests only; the app never composes these.
const importDeps = (rows: ImportRow[], seen: { limit?: number } = {}): GatewayDeps => {
  const repository: Pick<RepositoryPort, "listImports"> = {
    async listImports(_actor, limit) {
      seen.limit = limit;
      return rows;
    },
  };
  return { repository: repository as RepositoryPort, detection: null, generation: null };
};

describe("importScope — whose imports a role may follow", () => {
  it("lets an administrator see the whole organisation", () => {
    expect(importScope(actorOf("admin"))).toEqual({ uploadedBy: null });
  });

  it("narrows every other role to their own uploads", () => {
    for (const role of ["analyst", "employee", "external"] as const) {
      // Deal membership does not widen an import list: ownership is the only non-admin scope.
      expect(importScope(actorOf(role, [DEAL_A]))).toEqual({ uploadedBy: actorOf(role).actor_id });
    }
  });
});

describe("listImports", () => {
  it("asks the repository for at most the contract's 50 rows", async () => {
    const seen: { limit?: number } = {};
    await listImports(importDeps([], seen), actorOf("admin"));
    expect(seen.limit).toBe(LIST_LIMIT);
  });

  it("returns a contract-valid envelope with exactly the projected fields", async () => {
    const outcome = await listImports(importDeps([importRow()]), actorOf("employee"));
    expect(outcome.status).toBe(200);
    expect(check("Response", outcome.body)).toEqual({ ok: true, value: outcome.body });
    expect(outcome.body.data).toEqual({
      items: [{ id: importRow().id, run_id: RUN, status: "approved", classification: "internal" }],
    });
  });

  it("copies no column the projection does not name", async () => {
    const extra = {
      ...importRow(),
      storage_key: "quarantine/aster.pdf",
      sha256: "f".repeat(64),
    } as ImportRow;
    const outcome = await listImports(importDeps([extra]), actorOf("admin"));
    expect(JSON.stringify(outcome.body.data)).not.toContain("quarantine/aster.pdf");
    expect(JSON.stringify(outcome.body.data)).not.toContain("f".repeat(64));
  });

  it("skips a document whose import run has not settled instead of failing the list", async () => {
    const outcome = await listImports(
      importDeps([importRow({ run_id: null }), importRow({ id: "66666666-6666-4666-8666-666666666666" })]),
      actorOf("admin"),
    );
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toEqual({
      items: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          run_id: RUN,
          status: "approved",
          classification: "internal",
        },
      ],
    });
  });

  it("withholds the whole list when one row cannot be mapped", async () => {
    const outcome = await listImports(
      importDeps([importRow(), importRow({ status: "pending" })]),
      actorOf("admin"),
    );
    expect(outcome.status).toBe(503);
    expect(outcome.body.error?.code).toBe("STATE_UNAVAILABLE");
    expect(outcome.body.data).toBeNull();
  });

  it("returns an empty list rather than an error when nothing is visible", async () => {
    const outcome = await listImports(importDeps([]), actorOf("external"));
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toEqual({ items: [] });
  });
});
