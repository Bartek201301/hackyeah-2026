# Decyzje techniczne (ściąga na pytania jury)

**Główna myśl:** w 24 godziny trzy osoby budują równolegle, a czwarta scala. Największym ryzykiem nie jest brak funkcji, tylko to, że dwie części nie będą do siebie pasować. Dlatego architektura jest zaprojektowana tak, żeby ludzie sobie nie wchodzili w drogę, a każdy błąd dało się wykryć jedną komendą.

## Co zdecydowaliśmy i dlaczego

1. **Każda funkcja to osobny „pokój”** (`src/features/<nazwa>`). Ma w środku wszystko, czego potrzebuje: ekran, odczyt i zapis danych. Funkcje nie zaglądają do siebie nawzajem. Dzięki temu trzy osoby pracują jednocześnie bez konfliktów, a usunięcie lub wymiana jednej funkcji nie psuje pozostałych.
2. **Wspólne rzeczy mają jednego właściciela.** Wygląd, połączenie z bazą i definicje danych zmienia tylko jedna osoba (integrator). To jak jedna osoba z kluczem do wspólnej szafy — nie ma sytuacji, w której dwie osoby przestawiają te same półki.
3. **Umowa o kształcie danych zawarta na starcie** (`types.ts`). W drugiej godzinie ustalamy, jak wyglądają nasze dane, i potem wolno je tylko rozszerzać, nigdy zmieniać. To zapobiega sytuacji, w której jedna część wysyła „imię”, a druga czeka na „nazwę”.
4. **Automatyczny strażnik zasad** (`npm run check`). Jedna komenda sprawdza poprawność kodu, przestrzeganie podziału na „pokoje” i to, czy aplikacja się buduje. Nie musimy czytać kodu — wystarczy, że strażnik świeci na zielono.
5. **Spójny wygląd z jednego źródła.** Kolory, zaokrąglenia i cienie są zdefiniowane w jednym miejscu, a ekrany składamy z gotowych klocków (przycisk, formularz, pusta lista, błąd, ładowanie). Trzy osoby budują osobno, a aplikacja wygląda jak zaprojektowana przez jedną. Kolor marki zmieniamy jedną linijką.
6. **Każdy stan ekranu jest przewidziany:** ładowanie, brak danych, błąd z przyciskiem „spróbuj ponownie”. Użytkownik nigdy nie widzi pustej strony ani technicznego komunikatu.
7. **Dane czytamy i zapisujemy po stronie serwera.** Klucze i logika nie trafiają do przeglądarki bez potrzeby, a system sam zablokuje budowanie, jeśli ktoś przez pomyłkę spróbuje użyć serwerowego połączenia z bazą w przeglądarce.
8. **Diagnostyka jednym kliknięciem:** strona `/health` i komenda `npm run doctor` mówią po polsku, czy konfiguracja i baza działają, a jeśli nie — co dokładnie poprawić.
9. **Gotowa ścieżka publikacji:** każde wypchnięcie kodu automatycznie publikuje aplikację na Vercelu, a każda gałąź dostaje własny adres podglądu. Jury zawsze ogląda aktualną wersję, a my testujemy zmiany przed scaleniem.
10. **Sprawdzone, stabilne wersje narzędzi**, przypięte co do numeru. Celowo nie użyliśmy najnowszego TypeScriptu 7, bo Next.js obsługuje go dopiero eksperymentalnie.

## Czego świadomie NIE zrobiliśmy (i dlaczego)

- **Logowanie użytkowników** — nie wiemy, czy zadanie go wymaga; dodanie go „na zapas” to dodatkowe miejsce do awarii.
- **Testy automatyczne, CI, Docker** — nie zwrócą się w 24 godziny; „strażnik” i build łapią najczęstsze błędy.
- **Gotowa biblioteka komponentów** (np. ciężkie zestawy UI) — własny mały zestaw klocków jest prostszy, lżejszy i w pełni pod naszą kontrolą.
- **Tryb ciemny** — podwaja pracę nad wyglądem; lepiej dopracować jeden motyw.
- **Lokalna kopia bazy** — wszyscy korzystają z jednej bazy w chmurze; mniej instalacji, zero rozjazdów.
- **Blokady przy commitach (pre-commit)** — pod presją czasu narzędzie nie może nas zatrzymywać; formatowanie dzieje się samo w tle.
- **Generowanie typów z bazy** — wymagałoby dodatkowego narzędzia i logowania; kontrakt typów piszemy ręcznie w 2. godzinie.
