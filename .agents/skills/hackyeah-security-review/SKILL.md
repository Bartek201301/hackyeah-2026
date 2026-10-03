---
name: hackyeah-security-review
description: "Przegląd bezpieczeństwa funkcji HackYeah 2026: walidacja wejścia, autoryzacja, Supabase RLS, sekrety, upload i integracje. Używaj przed PR dotyczącym tych obszarów."
---

# Przegląd bezpieczeństwa HackYeah

Przeczytaj `AGENTS.md`, `docs/product/requirements.md`, odpowiednią część
`docs/product/architecture.md` i pliki objęte zadaniem.
Pracuj w przydzielonym zakresie.
Jeśli zlecono przegląd, zwróć ustalenia; poprawki wykonuj tylko w zakresie zleconej implementacji.
Brak decyzji o logowaniu lub dostępie w wymaganiach jest otwartym kontraktem, a nie zgodą na otwarty zapis.

## Materiał ECC

Przeczytaj istotne dla zadania sekcje [security-review](../../../docs/ai/ecc/upstream/security-review/SKILL.md):
sekrety, walidację, zapytania, autoryzację, XSS, CSRF i ujawnianie danych.
Blockchain, płatności i rozbudowana infrastruktura są poza zakresem, dopóki zadanie ich nie wymaga.
Instrukcje projektu i oficjalna dokumentacja używanej wersji mają pierwszeństwo przed przykładami ECC.

## Co sprawdzić

1. Każdy zapis waliduje niezaufane argumenty po stronie serwera, również identyfikatory rekordów.
   Tożsamość i uprawnienia muszą pochodzić ze zweryfikowanej sesji, nie z argumentu klienta.
2. Wymagane uprawnienia są sprawdzane w każdej akcji; ukrycie przycisku nie chroni danych.
   RLS ogranicza dostęp zgodnie z kontraktem, także przy bezpośrednim wywołaniu API Supabase.
3. Sekrety nie trafiają do klienta, logów ani repo. Publikowalny klucz jest celowo publiczny;
   klucz uprzywilejowany nie może zastępować poprawnych polityk. Nie wypisuj wartości sekretów.
4. Zapytania używają bezpiecznego API klienta lub parametryzacji. Błędy oczekiwane wracają
   jako `ActionResult<T>`; UI nie ujawnia komunikatów bazy i stosu wyjątków.
5. Upload, jeśli istnieje, ma ograniczenia rozmiaru i zawartości oraz odpowiednie polityki Storage.
   Nagłówek MIME i rozszerzenie podane przez klienta nie dowodzą typu zawartości.
6. Zweryfikuj obsługę niezaufanego HTML, URL-i i zewnętrznych żądań, jeśli występują w zmianie.
   Sprawdź limity kosztownych integracji według rzeczywistego ryzyka danej funkcji.
7. Dla warstwy kontroli sprawdź, czy wszystkie objęte nią interakcje i działania przechodzą
   przez centralną politykę, a ocena semantyczna nie przyznaje uprawnień. Sprawdź budżet,
   feed zagrożeń, ślad audytu i testy pozytywne/negatywne przy zmianie zachowania.
   Nie akceptuj wyjątku bezpieczeństwa zaszytego pod scenariusz demo.

## Dostosowanie do projektu

- Przed oceną Server Actions, cookies, CSRF lub CSP przeczytaj odpowiednie lokalne dokumenty
  `node_modules/next/dist/docs/` i dokumentację `@supabase/ssr`. Nie przenoś mechanicznie
  przykładów Express, własnego JWT ani wymogu HttpOnly na wszystkie cookies Supabase.
- `Zod`, `DOMPurify`, rate limiter i framework testowy w przykładach nie są zależnościami projektu.
  Nie instaluj ich tylko po to, by odtworzyć checklistę. Zależności zmienia integrator w uzgodnionym zakresie.
- Nie wykonuj `npm audit fix`, `npm update`, rotacji sekretów ani zmian usług podczas przeglądu.
  Wynik audytu zależności oceniaj pod kątem realnego zastosowania; nie jest dowodem bezpieczeństwa aplikacji.
- Testy zapisujące dane korzystają ze wspólnej bazy. Obowiązują uzgodnione dane i zasady AGENTS.md;
  przegląd sam w sobie nie upoważnia do testów obciążeniowych, resetów ani migracji.

## Wynik

Dla każdego potwierdzonego problemu podaj po angielsku wagę, plik i linię, możliwy scenariusz
oraz najmniejszą potrzebną poprawkę. Oddziel braki decyzji, niewykonane kontrole i realne błędy.
Nie deklaruj pełnego bezpieczeństwa na podstawie checklisty. Po zleconych poprawkach wykonaj
kontrole z AGENTS.md i testy dotyczące konkretnego ryzyka.
