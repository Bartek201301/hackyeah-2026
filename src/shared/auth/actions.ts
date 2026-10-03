"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/shared/supabase/server";

export async function signIn(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  let ok = false;
  if (
    typeof email === "string" &&
    typeof password === "string" &&
    email.length <= 254 &&
    password.length <= 200
  ) {
    try {
      const supabase = await createSupabaseServer();
      ok = !(await supabase.auth.signInWithPassword({ email, password })).error;
    } catch {
      ok = false;
    }
  }
  // One generic error: never reveal which field was wrong. redirect throws, so it stays outside try.
  redirect(ok ? "/workbench" : "/login?error=1");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
