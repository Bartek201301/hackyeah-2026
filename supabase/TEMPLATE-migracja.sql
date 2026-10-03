-- SZABLON, nie gotowa migracja. Integrator kopiuje do migrations/<RRRRMMDDHHMMSS>_<opis>.sql.
-- Najpierw uzgodnij encję, użytkowników i dostęp w SPEC. Commit + przegląd przed wykonaniem.
-- Po wykonaniu zapisz wynik w APPLIED.md; nigdy nie edytuj już zastosowanej migracji.

begin;

create table public.nazwa_tabeli (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null
);

alter table public.nazwa_tabeli enable row level security;
-- Brak dostępu domyślnego, również gdy projekt ma szerokie default privileges.
revoke all on public.nazwa_tabeli from anon, authenticated;

-- TU integrator dodaje polityki i granty zgodnie z SPEC. Każda operacja i rola osobno.
-- Dla danych użytkownika dodaj kolumnę właściciela i warunki (select auth.uid()) = owner_id.
-- SELECT: USING, INSERT: WITH CHECK, UPDATE: USING + WITH CHECK, DELETE: USING.
-- Nie kopiuj domyślnych USING (true) ani anonimowego zapisu.
-- Przed scaleniem zależnego kodu przetestuj zarówno dozwolony, jak i niedozwolony dostęp.

commit;
