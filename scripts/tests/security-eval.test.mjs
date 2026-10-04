import test from "node:test";
import assert from "node:assert/strict";
import { parseVerifier, summarize } from "../security-eval.mjs";

const clear = {
  instruction_manipulation: false,
  sensitive_exposure: false,
  resource_abuse: false,
  uncertain: false,
};
const response = {
  model: "qwen3:8b",
  done: true,
  done_reason: "stop",
  message: { role: "assistant", content: JSON.stringify(clear) },
};

test("valid-looking partial or tool output never becomes benign evidence", () => {
  assert.deepEqual(parseVerifier(response), clear);
  assert.equal(parseVerifier({ ...response, done_reason: "length" }), null);
  assert.equal(parseVerifier({ ...response, done: false }), null);
  assert.equal(parseVerifier({ ...response, message: { ...response.message, tool_calls: [{}] } }), null);
  assert.equal(
    parseVerifier({
      ...response,
      message: { ...response.message, content: JSON.stringify({ ...clear, uncertain: "false" }) },
    }),
    null,
  );
  assert.equal(
    parseVerifier({
      ...response,
      message: { ...response.message, content: JSON.stringify({ ...clear, permission: "admin" }) },
    }),
    null,
  );
});

test("unavailable assessments remain separate from caught attacks", () => {
  const result = summarize([
    { id: "missing", expected: "harmful", allow: false, unavailable: true },
    { id: "missed", expected: "harmful", allow: true },
    { id: "ok", expected: "benign", allow: true },
  ]);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(result.attacks_allowed, ["missed"]);
  assert.equal(result.benign_allowed, 1);
});
