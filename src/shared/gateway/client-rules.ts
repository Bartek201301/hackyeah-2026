// Deterministic role rules for reference-app client actions. AI may flag content, but these rules decide
// who may list, create, edit or delete a client and when a fee change needs human approval.

export type ClientRole = "admin" | "analyst" | "employee" | "external";
export type ActionVerdict = { decision: "ALLOW" | "REVIEW" | "BLOCK"; reasons: string[] };

// Largest relative annual-fee change each editing role may apply without review.
export const FEE_LIMITS = { analyst: 0.2, admin: 0.5 } as const;

const ALLOW: ActionVerdict = { decision: "ALLOW", reasons: [] };
const NOT_PERMITTED: ActionVerdict = { decision: "BLOCK", reasons: ["action:role_not_permitted"] };
const OVER_LIMIT: ActionVerdict = { decision: "REVIEW", reasons: ["action:change_exceeds_role_limit"] };

const isEditor = (role: ClientRole): role is keyof typeof FEE_LIMITS =>
  role === "analyst" || role === "admin";

export const canList = (role: ClientRole) => role !== "external";

export const createVerdict = (role: ClientRole): ActionVerdict => (isEditor(role) ? ALLOW : NOT_PERMITTED);

export const deleteVerdict = (role: ClientRole): ActionVerdict =>
  role === "admin"
    ? { decision: "REVIEW", reasons: ["action:destructive_requires_approval"] }
    : NOT_PERMITTED;

export function feeChangeVerdict(
  role: ClientRole,
  current: number | null,
  next: number | null,
): ActionVerdict {
  if (!isEditor(role)) return NOT_PERMITTED;
  if (next !== null && !(Number.isFinite(next) && next >= 0))
    return { decision: "BLOCK", reasons: ["action:invalid_fee"] };
  if (next === current || current === null) return ALLOW;
  // Clearing a fee or moving off zero has no bounded relative size.
  if (next === null || current === 0) return OVER_LIMIT;
  return Math.abs(next - current) / current <= FEE_LIMITS[role] ? ALLOW : OVER_LIMIT;
}

export type ClientChanges = {
  annual_fee_usd?: number | null;
  status?: string;
  sector?: string;
  notes?: string;
};

export function editVerdict(
  role: ClientRole,
  current: { annual_fee_usd: number | null },
  changes: ClientChanges,
): ActionVerdict {
  if (!isEditor(role)) return NOT_PERMITTED;
  return changes.annual_fee_usd !== undefined
    ? feeChangeVerdict(role, current.annual_fee_usd, changes.annual_fee_usd)
    : ALLOW;
}

export type ClientRow = {
  id: string;
  name: string;
  sector: string;
  status: string;
  created_at: string;
  annual_fee_usd: number | null;
  version: number;
  notes?: string | null;
};
export type EmployeeClientView = Pick<ClientRow, "id" | "name" | "sector" | "status" | "created_at">;

// Only editors see fees, versions and notes; every other role gets the minimal listing projection.
export function visibleClient(role: ClientRole, row: ClientRow): ClientRow | EmployeeClientView {
  if (isEditor(role)) return { ...row };
  const { id, name, sector, status, created_at } = row;
  return { id, name, sector, status, created_at };
}
