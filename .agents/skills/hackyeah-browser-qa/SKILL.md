---
name: hackyeah-browser-qa
description: "Sprawdzenie interfejsu i demo HackYeah 2026 w przeglądarce: preview, widok mobilny, nawigacja, formularze, stany ekranu i dostępność. Używaj po zmianach UI i przed pokazem."
---

# Sprawdzenie UI i demo HackYeah

Przeczytaj `AGENTS.md`, `docs/product/requirements.md` i kryteria zadania. Ustal adres, wersję wdrożenia oraz
ścieżkę użytkownika do sprawdzenia z dostępnego kontekstu. Użyj istniejącego narzędzia
przeglądarkowego i jego instrukcji. Gdy brak adresu lub dostępu, zgłoś konkretny brak;
nie zastępuj obserwacji przeglądarki odczytem kodu.

## Materiał ECC

Przeczytaj [browser-qa](../../../docs/ai/ecc/upstream/browser-qa/SKILL.md) jako listę
obszarów do sprawdzenia. Dopasuj ją do kryteriów tej funkcji i dostępnych narzędzi.
Nie instaluj przeglądarki, MCP, axe ani Playwright tylko dlatego, że występują w przykładach.
Nie uruchamiaj powiązanego monitoringu ani innych agentów bez zlecenia.

## Dane i zakres

Local, preview i production korzystają z tej samej bazy Supabase. Sam adres preview
nie izoluje zapisów. Zacznij od nawigacji i odczytu. Formularze zapisujące dane sprawdzaj
w ramach udzielonego zlecenia na uzgodnionych rekordach testowych; gdy zakres nie jest jasny,
wyjaśnij brak i kontynuuj niezależne sprawdzenia bez zapisów. Nie proś ponownie o już udzieloną zgodę.
Nie resetuj ani nie usuwaj wspólnych danych demo. Próbę na production wykonuj zgodnie z planem
zespołu zapisanym w wymaganiach i AGENTS.md. Chronione preview może wymagać dostępu członka zespołu.

## Przebieg

1. Przejdź kluczową ścieżkę użytkownika z kryteriów funkcji lub trzyminutowego demo.
   Sprawdź nawigację, poprawny widok i wynik działania. Nie uznawaj samego HTTP 200 za sukces.
2. Sprawdź wąski ekran około 375 px i desktop około 1440 px, a pośredni rozmiar, jeśli układ tego wymaga.
   Zwróć uwagę na przewijanie poziome, ucięte teksty, przyciski i czytelność polskich komunikatów.
3. Zweryfikuj stan pusty, ładowanie/wysyłanie i błąd, jeśli można je bezpiecznie odtworzyć.
   Uwzględnij podwójne wysłanie oraz poprawność widocznego wyniku po odświeżeniu, gdy zapis jest w zakresie.
4. Sprawdź klawiaturę, widoczny fokus, etykiety pól i dostępne nazwy przycisków.
   Nie deklaruj zgodności WCAG tylko na podstawie automatycznego narzędzia.
5. Obejrzyj błędy konsoli i sieci, jeśli narzędzie je udostępnia. Zrzuty ekranu zapisuj
   tylko bez sekretów i danych wrażliwych. Nie dopisuj pomiarów, których narzędzie nie wykonało.

## Wynik

Zwróć po polsku krótki raport: URL, sprawdzona wersja/commit (lub brak tej informacji), rozmiary
ekranu, wykonane kroki i wynik, błędy z reprodukcją oraz niewykonane kontrole.
Brak bazowych zrzutów oznacza brak potwierdzenia regresji wizualnej, nie blokuje samego sprawdzenia UI.
Nie raportuj Core Web Vitals bez pomiaru i nie przedstawiaj pojedynczej próby jako danych użytkowników.
Rozróżnij gotowość sprawdzonej ścieżki od pełnego warunku ukończenia z wymagań: check, CI, recenzja i demo.
