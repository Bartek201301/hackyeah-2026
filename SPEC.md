# SPEC — wypełnić w 1. godzinie (zanim powstanie jakikolwiek kod)

> Każda sesja Claude Code czyta ten plik przed pracą nad featurem. Pisz konkretnie i krótko.

## 1. Problem

<!-- Kto ma problem? Jaki? Dlaczego to boli? 2–3 zdania, najlepiej z liczbą/faktem z treści zadania. -->

## 2. Rozwiązanie w jednym zdaniu

<!-- "[Nazwa] pozwala [komu] [zrobić co], dzięki czemu [jaki efekt]." -->

## 3. Historyjki użytkownika

<!-- Format: Jako <kto> chcę <co>, aby <po co>. Każda historyjka = jeden feature = jedna osoba. -->

| #   | Historyjka           | Feature (`src/features/…`) | Właściciel | Priorytet |
| --- | -------------------- | -------------------------- | ---------- | --------- |
| 1   | Jako … chcę …, aby … |                            |            | MUST      |
| 2   | Jako … chcę …, aby … |                            |            | MUST      |
| 3   | Jako … chcę …, aby … |                            |            | MUST      |

## 4. Dane (wejście do `src/shared/types.ts` i migracji)

<!-- Tabele/encje i ich pola. To zamrażamy w 2. godzinie (potem tylko dopisywanie). -->

| Encja | Pola (nazwa: typ) | Kto zapisuje | Kto czyta |
| ----- | ----------------- | ------------ | --------- |
|       |                   |              |           |

## 5. Ścieżka demo (dokładnie to pokażemy jury, max 3 minuty)

1. Otwieram … i widzę …
2. Klikam … → dzieje się …
3. …
4. Puenta: …

<!-- Dane do demo przygotować w supabase/seed.sql. Demo przećwiczyć na adresie produkcyjnym z Vercela. -->

## 6. Zakres

### MUST — bez tego nie ma demo

- [ ]

### NICE — tylko jeśli MUST działa na produkcji

- [ ]

### POZA ZAKRESEM — świadomie nie robimy

-

## 7. Decyzje i założenia z treści zadania

<!-- Wszystko, co jury może zapytać: skąd dane, dlaczego tak, jakie ograniczenia. -->
