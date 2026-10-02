-- Funkcja diagnostyczna (nie domenowa): pozwala stronie /health i `npm run doctor`
-- potwierdzić, że aplikacja naprawdę rozmawia z bazą danych.
-- Wykonaj raz: Supabase -> SQL Editor -> wklej całość -> Run.

create or replace function public.health_check()
returns text
language sql
stable
as $$
  select 'ok ' || now()::text;
$$;

grant execute on function public.health_check() to anon, authenticated;
