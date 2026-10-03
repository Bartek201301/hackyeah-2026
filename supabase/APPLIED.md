# Rejestr migracji — tylko integrator

Jeden projekt Supabase obsługuje local, preview i production. Nie wpisuj tu haseł ani kluczy.
Migracja musi być commitowana i sprawdzona przed wykonaniem. Wykonane pliki są niezmienne.
Po sukcesie dopisz nazwę pliku, commit, projekt, czas UTC i wykonawcę; po błędzie zapisz wynik
oraz sprawdź stan bazy przed ponowieniem. Cofnięcie kodu nie cofa migracji.

| Plik migracji | Commit | Projekt | Czas UTC | Wykonawca | Wynik |
| ------------- | ------ | ------- | -------- | --------- | ----- |

Stan początkowy niezweryfikowany: istnieje migracja health_check, ale brak potwierdzenia,
że zastosowano ją w projekcie. Integrator sprawdza SQL i `/health` przed odnotowaniem sukcesu.
