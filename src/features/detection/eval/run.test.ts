import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import policyJson from "../../../../docs/contracts/policy.example.json";
import feedJson from "../../../../docs/contracts/threat-feed.example.json";
import type { DetectionPort, GatewayPolicy, GenerationPort, ThreatFeed } from "@/shared/contracts";
import manifest from "@/shared/contracts/runtime-manifest.json";
import { runOne } from "./run";

const policy = policyJson as GatewayPolicy;
const controls = {
  policy_version: 1,
  feed_version: 1,
  feed_expires_at: "2099-01-01T00:00:00Z",
  policy,
  feed: feedJson as ThreatFeed,
};

describe("synthetic provider runner", () => {
  it("uses the exact G2 stages and keeps both texts transient", async () => {
    const input = "Synthetic public update for runner test.";
    const output = "Synthetic public summary for runner test.";
    const stages: string[] = [];
    const detection: DetectionPort = {
      async parse() {
        throw new Error("unavailable");
      },
      async assess(request) {
        stages.push(`${request.operation}:${request.audience}`);
        return {
          findings: [],
          semantic: {
            status: "complete",
            scores: {
              instruction_manipulation: 0.1,
              sensitive_exposure: 0.2,
              resource_abuse: 0.1,
            },
            checkpoint_revision: manifest.laya_checkpoint_revision,
            windows_planned: 1,
            windows_completed: 1,
            coverage_complete: true,
            text_sha256: createHash("sha256").update(request.text).digest("hex"),
            coverage_ranges: [
              {
                start_char: 0,
                end_char: [...request.text].length,
                input_tokens: 100,
              },
            ],
          },
          semantic_input_tokens: 100,
          semantic_ms: 2,
        };
      },
    };
    const generation: GenerationPort = {
      async generate(request) {
        expect(request.messages[1]).toEqual({ role: "user", content: input });
        expect(request.tools).toEqual([]);
        expect(request.limits).toEqual(policy.execution);
        return {
          text: output,
          tool_calls: [],
          input_tokens: 20,
          output_tokens: 10,
          duration_ms: 3,
          model_digest: manifest.ollama_model_digest,
          finished: true,
        };
      },
    };
    const attempt = await runOne(
      { id: "development-benign-01", category: "benign", split: "development", text: input },
      controls,
      detection,
      generation,
    );
    expect(attempt.status).toBe("complete");
    expect(stages).toEqual(["chat_input:actor", "chat_output:actor"]);
    expect(attempt.input?.text_sha256).toBe(createHash("sha256").update(input).digest("hex"));
    expect(attempt.generation?.output_sha256).toBe(createHash("sha256").update(output).digest("hex"));
    expect(JSON.stringify(attempt)).not.toContain(input);
    expect(JSON.stringify(attempt)).not.toContain(output);
  });

  it("returns an incomplete record when coverage or revision is unusable", async () => {
    const detection: DetectionPort = {
      async parse() {
        throw new Error("unavailable");
      },
      async assess(request) {
        return {
          findings: [],
          semantic: {
            status: "complete",
            scores: {
              instruction_manipulation: 0.1,
              sensitive_exposure: 0.1,
              resource_abuse: 0.1,
            },
            checkpoint_revision: "wrong-revision",
            windows_planned: 1,
            windows_completed: 1,
            coverage_complete: true,
            text_sha256: createHash("sha256").update(request.text).digest("hex"),
            coverage_ranges: [{ start_char: 0, end_char: [...request.text].length, input_tokens: 100 }],
          },
          semantic_input_tokens: 100,
          semantic_ms: 2,
        };
      },
    };
    const generation: GenerationPort = {
      async generate() {
        throw new Error("generation_should_not_start");
      },
    };
    const attempt = await runOne(
      { id: "development-benign-01", category: "benign", split: "development", text: "Synthetic" },
      controls,
      detection,
      generation,
    );
    expect(attempt.status).toBe("incomplete");
    expect(attempt.error_code).toBe("coverage_or_revision_mismatch");
    expect(attempt.generation).toBeNull();
  });
});
