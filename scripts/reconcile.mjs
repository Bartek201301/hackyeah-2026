// Operator reconciliation: charge one call's unresolved reservations conservatively, as the fixture admin.
// Usage: node --env-file-if-exists=.env.local scripts/reconcile.mjs <call_id> --reason "<10-200 chars>"
// The full reserved amount becomes spent and the actual stays unknown. There is no refund path: without a
// bridge ledger nothing proves a call never started. Prints only `charged: n`; never keys or row data.
import { parseArgs } from "node:util";
import { admin, fixtures, must } from "./db/clients.mjs";

try {
  const { positionals, values } = parseArgs({
    options: { reason: { type: "string" } },
    allowPositionals: true,
  });
  const [callId] = positionals;
  if (positionals.length !== 1 || !/^[0-9a-f-]{36}$/i.test(callId) || !values.reason) {
    throw new Error('usage: scripts/reconcile.mjs <call_id> --reason "<10-200 chars>"');
  }
  const db = admin();
  const { email } = fixtures.accounts.find((account) => account.alias === "admin");
  const { users } = must("list users", await db.auth.admin.listUsers({ perPage: 1000 }));
  const adminId = users.find((user) => user.email === email)?.id;
  if (!adminId) throw new Error("fixture admin account not found");
  const result = must(
    "reconcile_reservation",
    await db.rpc("reconcile_reservation", {
      p_organisation_id: fixtures.organisation.id,
      p_admin_actor_id: adminId,
      p_call_id: callId,
      p_reason: values.reason,
    }),
  );
  console.log(`charged: ${result.charged}`);
} catch (error) {
  console.error(`reconcile failed — ${error.message}`);
  process.exitCode = 1;
}
