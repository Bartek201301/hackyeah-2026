import "server-only";

import type { ExampleItem } from "./types";

/*
 * ODCZYTY danych. Wywoływane z komponentów serwerowych (bez "use client").
 * Wzorzec na jutro, gdy tabela już istnieje:
 *   const supabase = await createSupabaseServer();   // z "@/shared/supabase/server"
 *   const { data, error } = await supabase.from("nazwa_tabeli").select("*");
 *   if (error) throw new Error(`Nie udało się pobrać danych: ${error.message}`);
 *   return data;
 */
export async function getExampleItems(): Promise<ExampleItem[]> {
  return [];
}
