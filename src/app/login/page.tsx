import { signIn } from "@/shared/auth/actions";
import { Button, Card, Field, Input, Notice, PageHeader } from "@/shared/ui";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md">
      <PageHeader title="Sign in" description="Use the prepared account you were given." />
      <Card>
        <form action={signIn} className="flex flex-col gap-4">
          {error === "1" && <Notice tone="danger">Invalid email or password.</Notice>}
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" maxLength={254} required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" maxLength={200} required />
          </Field>
          <Button type="submit">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
