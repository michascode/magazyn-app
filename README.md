# Magazyn Vinted

Desktopowa aplikacja magazynowa wspierająca ręczne wystawianie i zarządzanie produktami z myślą o Vinted. Zbudowana na Electronie, otwiera widok zgodny z makietą i oferuje filtry, listę produktów, paginację oraz panel edycji z obsługą wielu zdjęć.

## Wymagania
- Node.js 18+
- npm

## Uruchomienie w trybie deweloperskim
```
npm install
npm start
```

## Budowa paczki `.exe`
```
npm install
npm run package
```

> W katalogu `dist/` pojawi się instalator `MagazynApp Setup*.exe`. Po zainstalowaniu na Windows aplikację uruchomisz jak zwykły program (skrót w menu Start). Na czas developmentu nadal używaj `npm start`.

## Gdzie zapisują się dane
- Lista produktów zapisuje się lokalnie w `localStorage` przeglądarki wbudowanej w aplikację (klucz `magazyn-app-products`).
- Dzięki temu dodane/edytowane pozycje są dostępne po ponownym uruchomieniu aplikacji, zarówno z `npm start`, jak i z wersji `.exe`.
- Aby zacząć od stanu początkowego, wyczyść pamięć aplikacji (np. w DevTools → Application → Local Storage) albo usuń wpis dla tego klucza.

> Uwaga: w środowiskach z ograniczeniami sieciowymi może być konieczna konfiguracja proxy dla pobierania zależności.
> Jeśli `electron-builder` zgłasza komunikat „Package \"electron\" is only allowed in devDependencies”, upewnij się, że `electron` znajduje się w sekcji `devDependencies` w `package.json` (tak jak w repozytorium) i zainstaluj zależności ponownie.

## Wypychanie zmian na zdalne repozytorium
- Repozytorium jest lekkie i nie wymaga commitowania katalogu `node_modules` ani artefaktów buildu. `.gitignore` blokuje je domyślnie.
- Jeśli przez przypadek zostały już dodane do historii lokalnej, usuń je przed pushem:
  ```
  git rm -r --cached node_modules dist out release
  git commit -m "Usuń artefakty build/node_modules z repozytorium"
  ```
- Następnie spróbuj ponownie: `git push origin <branch>`.
- Jeżeli serwer odrzuca push przez limit 100 MB, sprawdź czy w stanie staged/committed nie ma plików `.exe` z Electrona (`node_modules/electron/dist/electron.exe`). Usuń je powyższym poleceniem.
- Jeśli w historii lokalnej nadal istnieją ślady `node_modules/electron/dist/electron.exe`, usuń cały katalog `node_modules` z historii: `git filter-repo --invert-paths --path node_modules/` (patrz sekcja niżej dla instalacji narzędzia w PowerShell).

## Gotowe komendy (PowerShell) do naprawy błędu GH001
Wpisz je w **PowerShell w katalogu repozytorium**. Zakładają, że używasz gałęzi `main`.

```powershell
# 0) Upewnij się, że jesteś w katalogu repo (tam gdzie jest .git)
cd C:\Users\micha\Desktop\Projekty\magazyn-app

# 1) Usuń lokalne artefakty (jeśli są) i przełącz się na właściwą gałąź
Remove-Item -Recurse -Force node_modules, dist, out, release -ErrorAction SilentlyContinue
git checkout main
git pull origin main

# 2) Zainstaluj git-filter-repo (jednorazowo)
python -m pip install git-filter-repo

# 3) Uruchom czyszczenie historii z node_modules/ (w tym electron.exe)
# Skrypt poniżej sam znajdzie git-filter-repo albo skorzysta z python -m git_filter_repo,
# więc ręczne podawanie ścieżki nie jest konieczne, jeśli masz Pythona w PATH.
$gitFilterRepo = "$env:USERPROFILE\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python311\\Scripts\\git-filter-repo.exe"
if (Test-Path $gitFilterRepo) {
  & $gitFilterRepo --invert-paths --path node_modules/
} else {
  python -m git_filter_repo --invert-paths --path node_modules/
}

# 4) Posprzątaj obiekty i wypchnij z nadpisaniem
git gc --prune=now --aggressive
git push --force origin main

# 5) Ponownie zainstaluj zależności i uruchom aplikację (lokalnie)
npm install
npm start
```

> Jeśli masz inną wersję Pythona niż 3.11, zamień fragment ścieżki `Python.3.11...Python311` na swoją wersję. W razie braku `git-filter-repo.exe` użyj naszego skryptu: `pwsh -File scripts/pwsh-remove-node-modules-history.ps1 -FilterRepoPath "C:\\pelna\\sciezka\\do\\git-filter-repo.exe"`.

## Usuwanie dużych plików z historii (błąd 100 MB)
1. **Sprawdź aktualne pliki w roboczym katalogu (przed commit/push).**
   ```bash
   ./scripts/check-large-working-tree.sh 90   # pokaże wszystko >90 MB (zmień próg według potrzeb)
   ```
   Jeśli pojawią się wpisy, usuń/wyklucz te pliki lub włącz dla nich Git LFS.

2. Zidentyfikuj największe obiekty w repozytorium:
   ```
   ./scripts/find-large-objects.sh
   ```
3. Jeśli zobaczysz pliki >90 MB (np. `renderer.js` albo binarki Electrona), usuń je z bieżącego drzewa roboczego, a potem nadpisz historię, żeby usunąć stare blob-y:
   ```
   # opcjonalnie: zainstaluj git-filter-repo, jeśli nie jest dostępne
   python -m pip install git-filter-repo

   # usuń duże pliki z historii (przykład: renderer.js)
   git filter-repo --invert-paths --path renderer.js

   # jeżeli duży był inny plik, zamień nazwę w powyższym poleceniu
   # po oczyszczeniu historii wypchnij z --force (musisz mieć do tego uprawnienia)
   git push --force origin <branch>
   ```
4. Po zakończeniu komend z punktu 3 upewnij się, że repozytorium nie pokazuje już dużych blobów (krok 2) i spróbuj zwykłego `git push origin <branch>`.

### Użycie git-filter-repo i skryptów na Windows/PowerShell
- Po instalacji `git-filter-repo` przez `python -m pip install git-filter-repo` jego plik wykonywalny może trafić do folderu spoza `PATH` (np. `C:\Users\<uzytkownik>\AppData\Local\...\Scripts\git-filter-repo.exe`). Uruchom polecenia z pełną ścieżką, np.:
  ```powershell
  C:\Users\<uzytkownik>\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\LocalCache\local-packages\Python311\Scripts\git-filter-repo.exe --invert-paths --path node_modules/
  ```
- Jeśli w PowerShell polecenie `head` nie istnieje, użyj odpowiednika:
  ```powershell
  ./scripts/find-large-objects.sh | Select-Object -First 50
  ```

## Szybka checklista gdy push/commit nadal nie działa
- Zweryfikuj, czy dodany zdalny jest prawidłowy:
  ```bash
  git remote -v
  ```
  Jeśli brak `origin`, dodaj:
  ```bash
  git remote add origin https://github.com/<twoje-konto>/<repo>.git
  ```

- Upewnij się, że bieżący branch ma najnowsze zmiany i nie zawiera starych, dużych blobów:
  ```bash
  git fetch origin
  ./scripts/find-large-objects.sh | head -n 50
  ```

- Gdy GitHub zwraca błąd limitu 100 MB mimo czystych obiektów:
  * Uruchom agresywne czyszczenie lokalne (usuwa osierocone bloby):
    ```bash
    git gc --prune=now --aggressive
    ```
  * Spróbuj ponownie:
    ```bash
    git push -f origin <twoj-branch>
    ```

- Gdy GitHub pisze dokładnie `fatal: pack exceeds GitHub's file size limit of 100.00 MB`, uruchom pełną diagnozę i usuń wskazane pliki:
  ```bash
  ./scripts/diagnose-push.sh 80   # podmień 80 na inny próg MB, jeśli potrzeba
  ```
  1. Sekcja "Largest objects" wskaże blob-y przekraczające próg (to one generują limit pack-a);
  2. Usuń je z historii (np. `git filter-repo --invert-paths --path <duzy-plik>`), a z katalogu roboczego usuń lub dodaj do `.gitignore`/Git LFS;
  3. Po czyszczeniu wykonaj `git gc --prune=now --aggressive` i `git push -f origin <branch>`.

- Jeśli problemem jest nadpisanie historii (np. lokalnie przepisanej), najpierw pobierz i prze-rebasuj:
  ```bash
  git pull --rebase origin <twoj-branch>
  git push origin <twoj-branch>
  ```

- Ostateczność: sklonuj repo od zera i przenieś tylko potrzebne pliki (bez dużych artefaktów), następnie zbuduj nową historię i wypchnij ją na czysty remote.
