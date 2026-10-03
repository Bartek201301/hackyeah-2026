# SPEC — wspólny kontrakt produktu

Status: **OCZEKUJEMY NA WYBÓR ZADANIA**. Nie implementujemy jeszcze domeny.
Dokument aktualizuje integrator po uzgodnieniu z zespołem; postęp pracy zapisujemy w PR.

## 1. Zadanie i kryteria jury

- Nazwa / link do oficjalnej treści: do ustalenia.
- Odbiorca i problem (2–3 zdania): do ustalenia.
- Rozwiązanie w jednym zdaniu: do ustalenia.
- Ograniczenia, wymagane dane i integracje: do ustalenia.

| Kryterium jury             | Waga z regulaminu | Co pokażemy jako dowód |
| -------------------------- | ----------------- | ---------------------- |
| Do uzupełnienia po wyborze | Nie zakładamy wag | Do ustalenia           |

## 2. Zespół i granice pracy

| Rola       | Osoba / GitHub | Katalog / odpowiedzialność                      |
| ---------- | -------------- | ----------------------------------------------- |
| Integrator | Do przypisania | shared, app, baza, konfiguracja, scalenia, demo |
| Builder A  | Do przypisania | Jeden feature — do ustalenia                    |
| Builder B  | Do przypisania | Jeden feature — do ustalenia                    |
| Builder C  | Do przypisania | Jeden feature — do ustalenia                    |

Każdy feature ma jednego właściciela. Integrator tworzy trasy i fundament kontraktów przed
rozpoczęciem zależnych gałęzi. Loginy posłużą też do dodania CODEOWNERS (kierowanie recenzji).

## 3. Funkcje i kryteria akceptacji

| ID  | Historyjka: jako / chcę / aby | Feature / właściciel     | Priorytet | Wejście → wynik | Zależności / kontrakt | Jak sprawdzimy sukces |
| --- | ----------------------------- | ------------------------ | --------- | --------------- | --------------------- | --------------------- |
| F1  | Do ustalenia                  | Builder A / do ustalenia | MUST      | Do ustalenia    | Do ustalenia          | Do ustalenia          |
| F2  | Do ustalenia                  | Builder B / do ustalenia | MUST      | Do ustalenia    | Do ustalenia          | Do ustalenia          |
| F3  | Do ustalenia                  | Builder C / do ustalenia | MUST      | Do ustalenia    | Do ustalenia          | Do ustalenia          |

Zakres NICE i świadomie pomijane funkcje: ustalimy z treści zadania. NICE zaczyna się dopiero,
gdy MUST działa na wdrożonym demo. Statusy, blokady i adresy gałęzi pozostają w PR.

## 4. Kontrakty przed równoległą implementacją

Status uzgodnienia: **NIEUZGODNIONE**. Zależna implementacja zaczyna się po uzgodnieniu tabeli.

| Encja / akcja | Pola / argumenty i wynik | Kto zapisuje / wywołuje | Kto czyta / odbiera | Dostęp / walidacja |
| ------------- | ------------------------ | ----------------------- | ------------------- | ------------------ |
| Do ustalenia  | Do ustalenia             | Do ustalenia            | Do ustalenia        | Do ustalenia       |

Wspólne typy: src/shared/types.ts. Wynik akcji: istniejący ActionResult<T>.
Po akceptacji zmiany kompatybilne i addytywne; potrzeby zmian zgłaszamy w PR integratora.
Dane w bazie są wspólne dla local, preview i production. Dostęp i logowanie ustalamy świadomie
z zadaniem; sam publishable key nie ogranicza dostępu do rekordów.

## 5. Demo — maksymalnie 3 minuty

1. Punkt wejścia i problem odbiorcy: do ustalenia.
2. Kluczowa czynność użytkownika: do ustalenia.
3. Widoczny wynik oraz dowód kryterium jury: do ustalenia.
4. Puenta i ograniczenia rozwiązania: do ustalenia.

Dane demo przygotowuje integrator w seed.sql. Powtórne uruchomienie nie może dublować danych.
Reset tylko w uzgodnionym oknie. Przed pokazem przerywamy zapisy testowe i ćwiczymy na production.

## 6. Warunek ukończenia i decyzje

- Pełny check oraz CI zielone, PR zaakceptowany przez kolegę.
- Kryteria historyjki sprawdzone; UI ma stan pusty, ładowanie i obsługę błędów.
- Zależna migracja wykonana przez integratora i odnotowana; żaden sekret nie trafia do Git.
- Ścieżka między funkcjami działa na preview, a cała prezentacja na production.

| Decyzja z zadania | Uzasadnienie / źródło | Status  |
| ----------------- | --------------------- | ------- |
| Do ustalenia      | Do ustalenia          | Otwarte |
