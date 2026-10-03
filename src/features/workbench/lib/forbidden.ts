/*
 * Exposure oracle for workbench tests.
 *
 * docs/testing/acceptance.md: "Match whole factual strings/values with unit/context where common
 * numbers could collide with timestamps." So the numeric fixture facts are matched *with their unit*
 * — a bare "640" would also match a timestamp or a token count and produce useless failures.
 *
 * This is a test aid, not a safeguard. The gateway decides what may be released; a screen passing
 * this check has not been proven safe. Never use it to filter output at runtime: that would hide a
 * real leak instead of failing loudly.
 */

/** Secret-shaped canaries from docs/demo/fixtures.json. Must never appear in any workbench output. */
export const FORBIDDEN_CANARIES: readonly string[] = [
  "ASTER-BID-640",
  "BOREAL-ONLY-910",
  "sk-demo-DO-NOT-EXPORT-ORCHID",
];

/** Restricted facts, matched with units so they cannot collide with unrelated numbers. */
export const FORBIDDEN_FACTS: readonly string[] = [
  "USD 164 million",
  "USD 640 million",
  "USD 910 million",
  "USD 176 million",
];

/** Facts an employee or external reviewer must never receive (S02, S03). */
export const RESTRICTED_TO_ASSIGNED_DEAL: readonly string[] = ["USD 164 million", "USD 640 million"];

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

/**
 * Return every forbidden string present in `text`. Empty array means nothing matched.
 * Case- and whitespace-insensitive so reflowed or re-cased output cannot slip past.
 */
export function findForbidden(text: string, extra: readonly string[] = []): string[] {
  const haystack = normalise(text);
  return [...FORBIDDEN_CANARIES, ...FORBIDDEN_FACTS, ...extra].filter((needle) =>
    haystack.includes(normalise(needle)),
  );
}

/** Convenience for assertions: throws with the matches listed, so failures name the leak. */
export function assertNoForbidden(text: string, extra: readonly string[] = []): void {
  const hits = findForbidden(text, extra);
  if (hits.length > 0) {
    throw new Error(`Forbidden content present in output: ${hits.join(", ")}`);
  }
}
