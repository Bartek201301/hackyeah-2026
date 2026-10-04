import { describe, expect, it } from "vitest";
import { describeOperation, describeReason, describeStage } from "./reasons";

describe("describeReason", () => {
  it("names signature matches by known pattern and where they were found", () => {
    expect(describeReason("input_signature:SIG-001")).toEqual({
      label: "Known prompt-injection pattern (SIG-001)",
      tone: "danger",
    });
    expect(describeReason("output_signature:SECRET_TOKEN").label).toBe(
      "Secret token or API key detected in the proposed answer",
    );
    expect(describeReason("client_signature:CONTACT_EMAIL").label).toBe(
      "Personal email address detected in the client details",
    );
    expect(describeReason("import_signature:SIG-002").label).toBe(
      "Known data-exfiltration address (SIG-002) in the uploaded file",
    );
    expect(describeReason("input_signature:SIG-042").label).toBe("Known threat-feed pattern (SIG-042)");
  });

  it("names bare finding codes", () => {
    expect(describeReason("CONTACT_EMAIL")).toEqual({
      label: "Personal email address detected",
      tone: "danger",
    });
    expect(describeReason("SECRET_TOKEN").label).toBe("Secret token or API key detected");
    expect(describeReason("PEM_KEY").label).toBe("Private key detected");
  });

  it("names the AI check and the second AI check", () => {
    expect(describeReason("semantic:instruction_manipulation").label).toBe(
      "AI check: attempt to override instructions",
    );
    expect(describeReason("semantic:sensitive_exposure").label).toBe(
      "AI check: could expose data beyond this account's access",
    );
    expect(describeReason("semantic:review_required").tone).toBe("warning");
    expect(describeReason("verification:resource_abuse").label).toMatch(
      /^Second AI check \(Qwen\) confirmed the risk/,
    );
    expect(describeReason("verification:uncertain")).toMatchObject({ tone: "warning" });
  });

  it("names citation, import, export, action, generation and tool codes", () => {
    expect(describeReason("citation:access_revoked").tone).toBe("danger");
    expect(describeReason("citation:missing").tone).toBe("warning");
    expect(describeReason("import:audience_unverified").tone).toBe("warning");
    expect(describeReason("import:invalid_csv").label).toBe("File is not valid CSV");
    expect(describeReason("export:unavailable").label).toBe("PDF not available to this account");
    expect(describeReason("action:role_not_permitted")).toEqual({
      label: "This role cannot do that",
      tone: "danger",
    });
    expect(describeReason("action:change_exceeds_role_limit").label).toBe(
      "Change exceeds this role's approval limit",
    );
    expect(describeReason("action:destructive_requires_approval").label).toBe(
      "Destructive actions need a second person",
    );
    expect(describeReason("generation:tool_call_refused").tone).toBe("danger");
    expect(describeReason("tool:search_excerpts").tone).toBe("neutral");
    expect(describeReason("BUDGET_EXHAUSTED").label).toBe("Budget for this period is used up");
  });

  it("falls back to the raw code instead of dropping or inventing a label", () => {
    for (const code of [
      "action:new_rule",
      "semantic:new_risk",
      "input_signature:UNKNOWN",
      "laya:settled",
      "x",
    ]) {
      expect(describeReason(code)).toEqual({ label: code, tone: "neutral" });
    }
  });
});

describe("describeOperation and describeStage", () => {
  it("names operations and keeps unknown ones as they are", () => {
    expect(describeOperation("chat_start")).toBe("Question");
    expect(describeOperation("action_start")).toBe("Client action from chat");
    expect(describeOperation("export_start")).toBe("Public PDF summary");
    expect(describeOperation("audit_export")).toBe("Audit CSV export");
    expect(describeOperation("policy_update")).toBe("Policy change");
    expect(describeOperation("something_new")).toBe("something_new");
  });

  it("names stages in words", () => {
    expect(describeStage("input_signature")).toBe("the known-pattern check on the question");
    expect(describeStage("access")).toBe("the access check");
    expect(describeStage("new_stage")).toBe("new stage");
  });
});
