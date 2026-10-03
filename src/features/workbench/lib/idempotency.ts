/*
 * Idempotency keys, bound to the action they belong to.
 *
 * protocols.md: uniqueness is `(organisation_id, actor_id, operation, idempotency_key)`, the server
 * stores a canonical request hash, "same key/hash returns the existing outcome, different hash
 * returns 409".
 *
 * So a key identifies **one action**, not one screen. Reusing it for a retry of the same request is
 * required; reusing it for a different request is a guaranteed 409. Holding a single key in a ref
 * for the lifetime of a panel gets the first case right and the second catastrophically wrong — the
 * second question a user asks would always conflict.
 *
 * `keyForAction` makes the binding explicit: same canonical input returns the same key, different
 * input mints a new one.
 */

export type ActionKey = {
  key: string;
  /** Canonical representation of the request this key was minted for. */
  input: string;
};

/**
 * The key to use for `input`, reusing `previous` when the request is unchanged.
 *
 * `mintKey` is injectable so tests do not depend on `crypto.randomUUID`.
 */
export function keyForAction(previous: ActionKey | null, input: string, mintKey: () => string): ActionKey {
  if (previous !== null && previous.input === input) return previous;
  return { key: mintKey(), input };
}

/**
 * Stable canonical form of the values that make up a request.
 *
 * Keys are sorted so field order cannot produce two "different" inputs for the same request, and
 * null is distinguished from an empty string so a cleared field is not mistaken for an absent one.
 */
export function canonicalInput(parts: Readonly<Record<string, string | number | null>>): string {
  const sorted = Object.keys(parts)
    .sort()
    .map((key) => [key, parts[key] ?? null] as const);
  return JSON.stringify(sorted);
}
