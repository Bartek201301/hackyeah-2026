import { connection } from "next/server";
import { CircleAlert, CircleCheck } from "lucide-react";
import { runHealthChecks } from "@/shared/health";
import { Card, PageHeader } from "@/shared/ui";

/* Diagnostic page: whether this deployment sees the environment variables and the database. */
export default async function HealthPage() {
  await connection();
  const checks = await runHealthChecks();
  const allOk = checks.length === 3 && checks.every((c) => c.ok);

  return (
    <>
      <PageHeader
        title="System status"
        description={allOk ? "HEALTH: OK — everything works." : "HEALTH: FAIL — see details below."}
      />
      <Card className="flex flex-col divide-y divide-border p-0">
        {checks.map((c) => (
          <div key={c.name} className="flex items-start gap-3 px-5 py-4">
            {c.ok ? (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            )}
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-sm break-all text-muted">{c.detail}</p>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
