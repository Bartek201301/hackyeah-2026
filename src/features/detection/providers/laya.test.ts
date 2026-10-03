import { describe, expect, it } from "vitest";
import policy from "../../../../docs/contracts/policy.example.json";
import type { GatewayPolicy } from "@/shared/contracts";
import {
  LAYA_QUESTIONS,
  LAYA_REPO,
  LAYA_REVISION,
  parseLaya,
  serializeLaya,
  validateLayaHealth,
} from "./laya";
import { ProviderFailure } from "./validation";

const limits = (policy as GatewayPolicy).semantic;
export const layaFixture = () => ({
  model: "laya-rl-agent",
  answers: Object.fromEntries(
    Object.keys(LAYA_QUESTIONS).map((name, i) => [
      name,
      {
        type: "noul",
        noul: [0.1839, 0.1817, 0.0104][i],
        confidence: 0.8,
        answer_confidence: 0.8,
        action: { act_probability: 0.7 },
      },
    ]),
  ),
  usage: {
    input_tokens: 199,
    output_tokens: 0,
    state_tokens: 31,
    state_tokens_dropped: 0,
    truncated: false,
    truncated_questions: [] as string[],
  },
  routing: {
    model: "typed-decisions",
    repo: LAYA_REPO,
    reason: "explicit model='typed-decisions'",
    detection: null,
    workflow: null,
  },
});
const input = {
  call_id: "ca984d6b-7475-4aa0-baff-a4e34e21d937",
  text: "Synthetic public result.",
  operation: "chat",
  audience: "actor" as const,
};

describe("Laya private wire mapping", () => {
  it("serializes exactly compact protocol state and three fixed questions", () => {
    const request = serializeLaya(input, limits);
    expect(request.state).toBe(
      '{"operation":"chat","audience":"actor","content":"Synthetic public result."}',
    );
    expect(request.model).toBe("typed-decisions");
    expect(request.questions).toEqual(LAYA_QUESTIONS);
    expect(Object.keys(request.questions)).toHaveLength(3);
    expect(request.max_len).toBe(1024);
    expect(() => serializeLaya({ ...input, model: "english" } as typeof input, limits)).toThrow(
      "invalid_input",
    );
    expect(() => serializeLaya({ ...input, text: "\ud800" }, limits)).toThrow("invalid_input");
    expect(() => serializeLaya(input, { ...limits, timeout_ms: 10001 })).toThrow("invalid_input");
  });
  it("keeps aggregate 199 tokens intact, distinct from state tokens and confidence", () => {
    const result = parseLaya(layaFixture(), LAYA_REVISION, 42);
    expect(result.usable).toBe(true);
    expect(result.usage.input_tokens).toBe(199);
    expect(result.usage.state_tokens).toBe(31);
    expect(result.scores.instruction_manipulation).toBe(0.1839);
    expect(result).not.toHaveProperty("decision");
    expect(result).not.toHaveProperty("coverage_complete");
  });
  for (const name of Object.keys(LAYA_QUESTIONS)) {
    it.each([undefined, null, "0.1", -0.01, 1.01, NaN, Infinity])(
      `rejects ${name} invalid scalar %s and retains usage`,
      (value) => {
        const raw = layaFixture();
        Object.assign(raw.answers[name], { noul: value });
        try {
          parseLaya(raw, LAYA_REVISION, 1);
          expect.fail("accepted invalid score");
        } catch (error) {
          expect(error).toMatchObject({ code: "invalid_response", dispatched: true, input_tokens: 199 });
        }
      },
    );
    it(`rejects missing ${name}`, () => {
      const raw = layaFixture();
      delete raw.answers[name];
      expect(() => parseLaya(raw, LAYA_REVISION, 1)).toThrow(ProviderFailure);
    });
  }
  it.each([
    (r: ReturnType<typeof layaFixture>) => {
      r.routing.model = "english";
    },
    (r: ReturnType<typeof layaFixture>) => {
      r.routing.repo = "other";
    },
    (r: ReturnType<typeof layaFixture>) => {
      r.routing.reason = "auto";
    },
    (r: ReturnType<typeof layaFixture>) => {
      Reflect.deleteProperty(r, "routing");
    },
    (r: ReturnType<typeof layaFixture>) => {
      Reflect.deleteProperty(r.usage, "truncated");
    },
    (r: ReturnType<typeof layaFixture>) => {
      Object.assign(r, { extra: "private" });
    },
    (r: ReturnType<typeof layaFixture>) => {
      Object.assign(r.answers.instruction_manipulation, { abstained: true });
    },
    (r: ReturnType<typeof layaFixture>) => {
      Object.assign(r.usage, { input_tokens: "199" });
    },
    (r: ReturnType<typeof layaFixture>) => {
      Object.assign(r.usage, { input_tokens: -1 });
    },
  ])("rejects malformed envelope without exposing body", (mutate) => {
    const raw = layaFixture();
    mutate(raw);
    expect(() => parseLaya(raw, LAYA_REVISION, 1)).toThrow("invalid_response");
  });
  it.each([
    { truncated: true },
    { state_tokens_dropped: 1 },
    { truncated_questions: ["resource_abuse"] },
    { input_tokens: null },
    { input_tokens: undefined },
    { options: {} },
  ])("never makes incomplete observation usable: %j", (patch) => {
    const raw = layaFixture();
    Object.assign(raw.usage, patch);
    expect(parseLaya(raw, LAYA_REVISION, 1).usable).toBe(false);
  });
  it("requires actual full revision and loaded device evidence", () => {
    expect(() => parseLaya(layaFixture(), "wrong", 1)).toThrow("revision_mismatch");
    expect(() => validateLayaHealth({ status: "ok" })).toThrow();
    const health = {
      status: "ok",
      loaded: ["typed-decisions"],
      revisions: { "typed-decisions": LAYA_REVISION },
      device: "mps",
      device_is_preference: false,
      checkpoint_devices: { "typed-decisions": "mps" },
      cpu_fallbacks: { "typed-decisions": { count: 0, last_reason: null } },
    };
    expect(validateLayaHealth(health)).toEqual({
      revision: LAYA_REVISION,
      device: "mps",
      cpu_fallback_count: 0,
    });
    expect(() => validateLayaHealth({ ...health, revisions: { "typed-decisions": "other" } })).toThrow(
      "revision_mismatch",
    );
    expect(() => validateLayaHealth({ ...health, device_is_preference: true })).toThrow();
  });
});

it("rejects inconsistent state and aggregate token evidence", () => {
  const raw = layaFixture();
  raw.usage.state_tokens = 1025;
  expect(() => parseLaya(raw, LAYA_REVISION, 1)).toThrow("invalid_response");
  raw.usage.state_tokens = 100;
  expect(() => parseLaya(raw, LAYA_REVISION, 1)).toThrow("invalid_response");
});
