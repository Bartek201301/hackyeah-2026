# DESIGN — jak ma wyglądać każdy ekran

> Czyta to każda osoba i każda sesja Claude Code PRZED budową ekranu. Design to 20% oceny.
> Żywy wzorzec: strona **`/ui`** (sekcja „Wzorzec: dashboard”). W razie wątpliwości — zrób jak tam.

## 1. Styl w jednym zdaniu

**Jasny, „miękki” dashboard: białe, mocno zaokrąglone karty unoszą się nad lawendowo-szarym tłem, jeden nasycony indygo jako kolor marki, duże pogrubione liczby, małe kolorowe pigułki.**

Inspiracja: nowoczesne panele SaaS (białe karty, sidebar z niebieskim aktywnym kafelkiem, jedna wyróżniona karta w kolorze marki).

## 2. Pięć zasad, których nie łamiemy

1. **Jedna mocna barwa na ekran.** Indygo (`brand`) tylko dla: głównego przycisku, aktywnej pozycji menu, JEDNEJ wyróżnionej karty, słupków/pasków wykresu. Cała reszta to biel, szarości i czarny tekst.
2. **Wszystko siedzi w kartach.** Treść nigdy nie leży „gołym tekstem” na tle. Tło (`bg-bg`) to tylko przestrzeń między kartami.
3. **Dużo powietrza.** Odstęp między kartami `gap-6`, wnętrze karty `p-6` (już w `Card`). Nie ściskaj — lepiej mniej elementów.
4. **Liczba jest bohaterem.** Kluczowe wartości duże i pogrubione (`StatCard`), opis mały i szary obok.
5. **Kolor = znaczenie.** Zielona pigułka = dobrze/wzrost, czerwona = źle/spadek, żółta = w toku, szara = neutralne. Nigdy dekoracyjnie.

## 3. Klocki — czego użyć do czego

Wszystko z `@/shared/ui`. Nie piszesz własnych kart, przycisków, pigułek.

| Potrzebujesz…                           | Użyj                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| Tytuł ekranu (zawsze, na górze)         | `PageHeader` (+ `actions` = główny przycisk po prawej)               |
| Kontener treści                         | `Card`                                                               |
| Tytuł sekcji w karcie + filtr po prawej | `CardHeader title description actions`                               |
| Kluczowa liczba (3–4 w rzędzie)         | `StatCard icon label value hint change trend`                        |
| Najważniejsza liczba ekranu             | `StatCard highlight` — **max. jedna na ekran**                       |
| Status / zmiana procentowa              | `Badge tone="success"` (też `danger`, `warning`, `brand`, `neutral`) |
| Ikona przy pozycji listy / w karcie     | `IconTile icon={...} tone="brand"`                                   |
| Udział / postęp / ranking               | `ProgressBar label valueLabel value`                                 |
| Wykres w czasie / porównanie            | `BarChart data valueLabel compareLabel`                              |
| Formularz                               | `Field` + `Input` / `Textarea` / `Select`, wysyłka: `Button loading` |
| Pusta lista                             | `EmptyState` (z przyciskiem „Dodaj pierwszy…”)                       |
| Błąd akcji                              | `Notice tone="danger"`                                               |
| Błąd całej sekcji                       | `ErrorState`                                                         |
| Ładowanie                               | `LoadingState` / `Skeleton`                                          |

Brakuje klocka (np. avatar, tabela, zakładki)? **Nie pisz go w featurze** — zgłoś integratorowi, doda do `shared/ui`.

## 4. Układ ekranu (szablony)

**Dashboard / przegląd:**

```tsx
<PageHeader title="…" description="…" actions={<Button>Główna akcja</Button>} />
<div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
  <div className="flex flex-col gap-6">
    <div className="grid gap-6 sm:grid-cols-2">{/* 2–4× StatCard, pierwsza highlight */}</div>
    <Card><CardHeader … /><BarChart … /></Card>
  </div>
  <div className="flex flex-col gap-6">{/* karty boczne: ProgressBar, lista z IconTile + Badge */}</div>
</div>
```

**Lista + formularz:** `grid gap-6 lg:grid-cols-[1fr_2fr]` — formularz w `Card` po lewej, lista (lub `EmptyState`) po prawej. Wzór: `src/features/example`.

**Lista elementów w karcie:** wiersz = `IconTile` + (pogrubiona nazwa, pod nią szary `text-xs` opis) + `Badge` po prawej, odstęp `gap-4`.

**Szczegóły / formularz pojedynczy:** jedna `Card` o szerokości `max-w-2xl`, pola `flex flex-col gap-4`.

## 5. Typografia

| Element                     | Klasy                                                       |
| --------------------------- | ----------------------------------------------------------- |
| Tytuł strony                | (w `PageHeader`) `text-3xl font-bold`                       |
| Tytuł karty                 | (w `CardHeader`) `text-lg font-semibold`                    |
| Duża liczba                 | (w `StatCard`) `text-3xl font-bold tabular-nums`            |
| Tekst zwykły                | `text-sm text-fg`                                           |
| Opis / podpis               | `text-sm text-muted` albo `text-xs text-muted`              |
| Etykieta grupy (jak „MENU”) | `text-xs font-semibold uppercase tracking-wider text-muted` |

Liczby formatuj po polsku: `n.toLocaleString("pl-PL")` → `34 760`, procenty z przecinkiem: `+12,4%`, minus jako `−`.

## 6. Tokeny (jedyne dozwolone kolory/kształty)

Zdefiniowane w `src/app/globals.css`. W featurach **zakazane**: `#hex`, `bg-[…]`, `text-[…]`, pliki `.css`, inne biblioteki UI (pilnuje tego `npm run check`).

| Token                                        | Klasa przykładowa                | Do czego                                |
| -------------------------------------------- | -------------------------------- | --------------------------------------- |
| `brand`                                      | `bg-brand`, `text-brand`         | główna akcja, aktywne, wykres           |
| `brand-soft`                                 | `bg-brand-soft`                  | tło ikon, delikatne podświetlenie       |
| `bg`                                         | `bg-bg`                          | tło strony (lawendowo-szare)            |
| `surface`                                    | `bg-surface`                     | karty                                   |
| `surface-muted`                              | `bg-surface-muted`               | pola formularzy, tło pasków, hover      |
| `fg` / `muted`                               | `text-fg`, `text-muted`          | tekst główny / pomocniczy               |
| `border`                                     | `border-border`                  | rzadko — karty nie mają widocznej ramki |
| `success` / `danger` / `warning` (+ `-soft`) | `text-success`, `bg-danger-soft` | znaczenie, nie dekoracja                |
| `ink` / `on-ink`                             | `bg-ink text-on-ink`             | ciemne dymki, wyjątkowe akcenty         |
| `rounded-card`                               | 1.5rem                           | karty                                   |
| `rounded-control`                            | 0.875rem                         | przyciski, pola, kafelki ikon           |
| `shadow-card`                                |                                  | karty                                   |
| `shadow-brand`                               |                                  | elementy w kolorze marki (poświata)     |

Zmiana koloru marki dla całej aplikacji = jedna linia `--color-brand` (robi integrator).

## 7. Ikony

Tylko `lucide-react`, rozmiar `size-5` (w `IconTile` automatycznie), zawsze `aria-hidden` gdy obok jest tekst. Jedna ikona = jedno znaczenie w całej aplikacji (np. `ClipboardList` zawsze = zgłoszenie).

## 8. Telefon

Każdy ekran musi działać na szerokości ~390 px. Siatki zawsze zaczynają od 1 kolumny i rozszerzają się progami: `grid gap-6 sm:grid-cols-2 xl:grid-cols-[2fr_1fr]`. Nigdy stałe szerokości w px. Menu boczne chowa się samo (robi to `AppShell`).

## 9. Teksty

Po polsku, krótko, po ludzku. Przyciski = czasownik („Dodaj zgłoszenie”, nie „OK”). Pusty stan mówi, co zrobić dalej. Błąd mówi, co się stało i co teraz — bez kodów i stack trace.

## 10. Checklista przed commitem ekranu

- [ ] `PageHeader` na górze, treść w kartach
- [ ] Max. jedna karta `highlight` i jeden przycisk `primary` na ekran
- [ ] Pusta lista → `EmptyState`, błąd → `Notice tone="danger"`, wysyłka → `Button loading`
- [ ] Zero surowych kolorów, zero własnych komponentów, które dublują `shared/ui`
- [ ] Sprawdzone w `npm run dev` na szerokim oknie i na wąskim (DevTools → tryb telefonu)
- [ ] Wszystkie teksty po polsku
- [ ] `npm run check` zielony
