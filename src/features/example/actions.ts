"use server";

import type { ActionResult } from "@/shared/types";

/*
 * ZAPISY danych (Server Actions). Zawsze zwracają ActionResult, nigdy nie rzucają
 * wyjątku do UI. Wzorzec zapisu do bazy na jutro:
 *   const supabase = await createSupabaseServer();
 *   const { error } = await supabase.from("nazwa_tabeli").insert({ name });
 *   if (error) return { ok: false, error: "Nie udało się zapisać. Spróbuj ponownie." };
 *   revalidatePath("/example");   // z "next/cache" — odświeża listę
 */
export async function submitExample(
  _prev: ActionResult<{ name: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ name: string }>> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Nazwa musi mieć co najmniej 2 znaki." };
  }
  return { ok: true, data: { name } };
}
