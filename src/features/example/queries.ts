import "server-only";

import type { ExampleItem } from "./types";

/*
 * Data READS. Called from server components (no "use client").
 * Pattern for tomorrow, once the table exists:
 *   const supabase = await createSupabaseServer();   // from "@/shared/supabase/server"
 *   const { data, error } = await supabase.from("table_name").select("*");
 *   if (error) throw new Error(`Could not load data: ${error.message}`);
 *   return data;
 */
export async function getExampleItems(): Promise<ExampleItem[]> {
  return [];
}
