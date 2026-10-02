-- SZABLON MIGRACJI — skopiuj do supabase/migrations/<RRRRMMDDHHMMSS>_<opis>.sql
-- Migracje pisze i wykonuje TYLKO integrator (Supabase -> SQL Editor -> wklej -> Run).
-- Po każdej nowej tabeli: dopisz jej typ do src/shared/types.ts (nazwy pól = nazwy kolumn).

create table public.nazwa_tabeli (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null
);

-- RLS włączone + otwarte polityki: aplikacja nie ma logowania, więc każdy odwiedzający
-- (rola anon) może czytać i zapisywać. Wystarczające na demo, NIE na produkcję.
alter table public.nazwa_tabeli enable row level security;

create policy "nazwa_tabeli: odczyt dla wszystkich" on public.nazwa_tabeli
  for select to anon, authenticated using (true);
create policy "nazwa_tabeli: zapis dla wszystkich" on public.nazwa_tabeli
  for insert to anon, authenticated with check (true);
create policy "nazwa_tabeli: edycja dla wszystkich" on public.nazwa_tabeli
  for update to anon, authenticated using (true) with check (true);

-- Jawne uprawnienia, żeby tabela była widoczna przez API niezależnie od ustawień projektu.
grant select, insert, update on public.nazwa_tabeli to anon, authenticated;
