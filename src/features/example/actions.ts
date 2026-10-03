"use server";

import type { ActionResult } from "@/shared/types";

/*
 * Data WRITES (Server Actions). They always return ActionResult and never throw
 * to the UI. Database write pattern for tomorrow:
 *   const supabase = await createSupabaseServer();
 *   const { error } = await supabase.from("table_name").insert({ name });
 *   if (error) return { ok: false, error: "Could not save. Try again." };
 *   revalidatePath("/example");   // from "next/cache" — refreshes the list
 */
export async function submitExample(
  _prev: ActionResult<{ name: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ name: string }>> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters." };
  }
  return { ok: true, data: { name } };
}
