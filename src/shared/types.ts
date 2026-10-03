/*
 * ============================================================================
 *  KONTRAKT ZESPOŁU — wspólne typy danych dla wszystkich featurów.
 * ============================================================================
 *
 *  Po co: trzy osoby budują równolegle. Jeśli każda wymyśli własny kształt
 *  "zgłoszenia" czy "użytkownika", scalenie gałęzi skończy się rozjazdem typów.
 *  Ten plik ustala kształt danych RAZ, zanim ktokolwiek zacznie pracę.
 *
 *  Zasady:
 *  1. Wypełnia go integrator przed zależną implementacją, razem ze schematem bazy
 *     (supabase/migrations). Nazwy pól = nazwy kolumn w bazie (snake_case).
 *  2. Po zamrożeniu: TYLKO DOPISYWANIE (nowe typy, nowe pola opcjonalne).
 *     Nigdy zmiana nazwy, zmiana typu ani usunięcie. Tylko integrator, przez PR.
 *  3. Typy prywatne jednego featura trzymaj w src/features/<nazwa>/types.ts, nie tutaj.
 * ============================================================================
 */

/* ---------- 1. Typy pomocnicze (gotowe, nie zmieniać) ---------- */

/** Identyfikator wiersza w bazie (uuid jako tekst). */
export type Id = string;

/** Data/czas w formacie ISO, tak jak zwraca Supabase, np. "2026-10-03T12:00:00Z". */
export type IsoDateTime = string;

/**
 * Wynik każdej Server Action. Akcja nigdy nie rzuca wyjątku do UI —
 * zwraca { ok: false, error } z komunikatem po polsku do pokazania użytkownikowi.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/* ---------- 2. Encje domenowe (uzgodnić przed implementacją) ---------- */
/*
 * Wzór jednej encji (odpowiada tabeli w bazie):
 *
 *   export type Report = {
 *     id: Id;
 *     created_at: IsoDateTime;
 *     title: string;
 *     status: ReportStatus;
 *   };
 *   export type ReportStatus = "new" | "in_progress" | "done";
 */

/* ---------- 3. Dane wejściowe formularzy / akcji (uzgodnić przed implementacją) ---------- */
/*
 * Wzór:  export type NewReport = Pick<Report, "title">;
 */
