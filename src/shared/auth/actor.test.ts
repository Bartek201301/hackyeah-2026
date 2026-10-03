import { describe, expect, it } from "vitest";
import { toActorContext } from "./actor";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000002";
const ASTER = "00000000-0000-4000-8000-0000000000a1";
const ACTOR = "00000000-0000-4000-8000-0000000000f1";

describe("toActorContext", () => {
  it("returns null without a membership", () => {
    expect(toActorContext(ACTOR, [], [])).toBeNull();
  });

  it("returns null for more than one membership", () => {
    const rows = [
      { organisation_id: ORG, role: "employee" as const },
      { organisation_id: OTHER_ORG, role: "admin" as const },
    ];
    expect(toActorContext(ACTOR, rows, [])).toBeNull();
  });

  it("maps an analyst with ASTER", () => {
    expect(
      toActorContext(
        ACTOR,
        [{ organisation_id: ORG, role: "analyst" }],
        [{ organisation_id: ORG, deal_id: ASTER }],
      ),
    ).toEqual({
      actor_id: ACTOR,
      organisation_id: ORG,
      role: "analyst",
      deal_ids: [ASTER],
      audience: "actor",
      scopes: [],
    });
  });

  it("maps an admin with no deals", () => {
    expect(toActorContext(ACTOR, [{ organisation_id: ORG, role: "admin" }], [])?.deal_ids).toEqual([]);
  });

  it("ignores deal rows from another organisation", () => {
    const actor = toActorContext(
      ACTOR,
      [{ organisation_id: ORG, role: "analyst" }],
      [
        { organisation_id: OTHER_ORG, deal_id: "00000000-0000-4000-8000-0000000000b2" },
        { organisation_id: ORG, deal_id: ASTER },
      ],
    );
    expect(actor?.deal_ids).toEqual([ASTER]);
  });
});
