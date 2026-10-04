import { signIn } from "@/shared/auth/actions";
import { LogoMark } from "@/shared/layout/AppShell";
import { Button, Card, Field, Input, Notice } from "@/shared/ui";
import { APP_NAME } from "../nav";
import { GatewayFlow } from "./GatewayFlow";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-2">
      <div className="flex w-full max-w-sm flex-col gap-8 place-self-center px-4 py-12 sm:px-0">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-11" />
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{APP_NAME}</h1>
          <p className="text-sm text-muted">
            Ask questions about company data. Every answer is checked against policy before you see it.
          </p>
        </div>
        <Card>
          <h2 className="text-base font-semibold text-fg">Sign in</h2>
          <p className="mt-1 mb-5 text-sm text-muted">Use the prepared account you were given.</p>
          <form action={signIn} className="flex flex-col gap-4">
            {error === "1" && <Notice tone="danger">Invalid email or password.</Notice>}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="username" maxLength={254} required />
            </Field>
            <Field label="Password">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={200}
                required
              />
            </Field>
            <Button type="submit">Sign in</Button>
          </form>
        </Card>
      </div>
      {/* Decorative only; hidden below lg so the form is the whole phone screen. */}
      <div className="hidden p-4 lg:block">
        <div className="size-full rounded-card border border-border bg-surface-muted">
          <GatewayFlow />
        </div>
      </div>
    </main>
  );
}
