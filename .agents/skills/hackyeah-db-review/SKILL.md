---
name: hackyeah-db-review
description: "Przegląd migracji, zapytań PostgreSQL i polityk Supabase RLS w HackYeah 2026. Używaj przy zmianach SQL, kontraktów danych i wolnych zapytań; sam przegląd nie wykonuje migracji."
---

# Przegląd bazy HackYeah

Przeczytaj `AGENTS.md`, `docs/product/requirements.md` i pliki objęte zadaniem. Pracuj w przydzielonym zakresie.
Jeśli zlecono przegląd, zwróć ustalenia; poprawki wykonuj tylko w zakresie zleconej implementacji.
Gdy kontrakty lub sposób dostępu nadal są nieuzgodnione, zgłoś tę zależność zamiast wymyślać domenę.

## Materiał ECC

Przeczytaj [postgres-patterns](../../../docs/ai/ecc/upstream/postgres-patterns/SKILL.md)
jako materiał pomocniczy. Obowiązują zasady projektu i dokumentacja używanej wersji Supabase.
Przykłady nie upoważniają do uruchamiania SQL ani delegowania pracy agentom wymienionym w ECC.

## Co sprawdzić

1. Zgodność nazw i typów kolumn z uzgodnionym kontraktem oraz `src/shared/types.ts`.
   Ograniczenia NOT NULL, UNIQUE i klucze obce muszą odpowiadać wymaganiom funkcji.
2. RLS na nowych tabelach; jawne operacje i role w politykach. Dla danych użytkownika
   sprawdź `auth.uid()`, warunki `USING` i `WITH CHECK` odpowiednie dla danej operacji.
   Zweryfikuj także przypadek niezalogowanego użytkownika oraz dostępu do cudzego rekordu.
3. Odczyty serwerowe przez `createSupabaseServer`, zapisy przez walidowane akcje
   i `ActionResult<T>`. Publishable key nie zastępuje kontroli dostępu.
4. Addytywność migracji i zgodność z istniejącymi danymi. Wykonanych migracji nie edytuj;
   sprawdź `supabase/APPLIED.md`. Seed powinien być powtarzalny i używać danych testowych.
5. Indeksy uzasadnione konkretnym filtrowaniem, sortowaniem i relacjami; wielkość wyników,
   paginację i liczbę zapytań. Nie zgłaszaj problemu wydajności bez wskazania konkretnego zapytania.

## Dostosowanie do projektu

- ECC upraszcza dobór identyfikatorów. Nie zmieniaj UUID ani uzgodnionych typów tylko dlatego,
  że tabela w przykładzie preferuje `bigint`.
- Przykładowa polityka ECC bez jawnej roli i operacji nie jest gotową migracją projektu.
- Nie uruchamiaj szablonu `ALTER SYSTEM`, globalnych `REVOKE`, instalacji rozszerzeń,
  resetów ani poleceń utrzymaniowych jako części przeglądu.
- Local, preview i production mają jedną bazę. `EXPLAIN ANALYZE` wykonuje zapytanie;
  nie stosuj go do mutacji podczas przeglądu. Migracje i resety prowadzi integrator.

## Wynik

Podaj po polsku: plik i linię, problem, scenariusz błędu oraz minimalną poprawkę.
Oddziel potwierdzone ustalenia od pytań i testów niewykonanych. Przegląd plików i zielony build
nie potwierdzają działania RLS w bazie. Po zleconych poprawkach wykonaj kontrole z AGENTS.md.
