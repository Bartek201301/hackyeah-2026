import { describe, expect, it } from "vitest";
import { canonicalInput, keyForAction, type ActionKey } from "./idempotency";

/** Deterministic key source so assertions do not depend on crypto.randomUUID. */
const minter = () => {
  let n = 0;
  return () => `key-${++n}`;
};

describe("keyForAction", () => {
  it("mints a key when there is none", () => {
    const mint = minter();
    expect(keyForAction(null, "ask A", mint)).toEqual({ key: "key-1", input: "ask A" });
  });

  it("reuses the key for a retry of the same request", () => {
    const mint = minter();
    const first = keyForAction(null, "ask A", mint);
    const retry = keyForAction(first, "ask A", mint);
    expect(retry).toBe(first);
    expect(retry.key).toBe("key-1");
  });

  it("mints a new key for a different request", () => {
    // The regression: a single key reused across two questions returns 409 from the gateway,
    // because the canonical request hash differs.
    const mint = minter();
    const first = keyForAction(null, "ask A", mint);
    const second = keyForAction(first, "ask B", mint);
    expect(second.key).not.toBe(first.key);
    expect(second.key).toBe("key-2");
  });

  it("survives an A -> B -> A sequence by minting a third key", () => {
    const mint = minter();
    const a1 = keyForAction(null, "A", mint);
    const b = keyForAction(a1, "B", mint);
    const a2 = keyForAction(b, "A", mint);
    expect([a1.key, b.key, a2.key]).toEqual(["key-1", "key-2", "key-3"]);
  });

  it("treats whitespace-only differences as different requests", () => {
    // Callers trim before building the input; anything that reaches here is already canonical.
    const mint = minter();
    const first = keyForAction(null, "A", mint);
    expect(keyForAction(first, "A ", mint).key).not.toBe(first.key);
  });

  it("does not mutate the previous key", () => {
    const mint = minter();
    const first: ActionKey = keyForAction(null, "A", mint);
    keyForAction(first, "B", mint);
    expect(first).toEqual({ key: "key-1", input: "A" });
  });
});

describe("canonicalInput", () => {
  it("is independent of field order", () => {
    expect(canonicalInput({ a: "1", b: "2" })).toBe(canonicalInput({ b: "2", a: "1" }));
  });

  it("changes when any value changes", () => {
    const base = canonicalInput({ file: "a.csv", classification: "internal" });
    expect(canonicalInput({ file: "a.csv", classification: "public" })).not.toBe(base);
    expect(canonicalInput({ file: "b.csv", classification: "internal" })).not.toBe(base);
  });

  it("distinguishes null from an empty string", () => {
    expect(canonicalInput({ deal: null })).not.toBe(canonicalInput({ deal: "" }));
  });

  it("distinguishes a number from its string form", () => {
    expect(canonicalInput({ size: 10 })).not.toBe(canonicalInput({ size: "10" }));
  });

  it("treats a missing key and an explicit null as the same absent value", () => {
    expect(canonicalInput({ a: "1", b: null })).toBe(canonicalInput({ b: null, a: "1" }));
  });

  it("produces a stable string for an unchanged request", () => {
    const parts = { file: "facts.csv", size: 2048, classification: "internal", deal: null };
    expect(canonicalInput(parts)).toBe(canonicalInput({ ...parts }));
  });
});
