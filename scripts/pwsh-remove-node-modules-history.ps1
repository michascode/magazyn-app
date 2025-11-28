Param(
  [string]$FilterRepoPath
)

$ErrorActionPreference = 'Stop'

function Find-GitFilterRepo {
  param(
    [string]$OverridePath
  )

  if ($OverridePath -and (Test-Path $OverridePath)) {
    return (Resolve-Path $OverridePath).Path
  }

  $cmd = Get-Command git-filter-repo -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $commonPath = Join-Path $env:USERPROFILE "AppData/Local/Packages/PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0/LocalCache/local-packages/Python311/Scripts/git-filter-repo.exe"
  if (Test-Path $commonPath) {
    return $commonPath
  }

  return $null
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git nie jest dostępny w PATH. Zainstaluj Git i spróbuj ponownie."
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Error "Uruchom skrypt z katalogu repozytorium (folder z .git)."
}

Set-Location $repoRoot

$exe = Find-GitFilterRepo -OverridePath $FilterRepoPath
if (-not $exe) {
  Write-Error "Nie znaleziono git-filter-repo. Zainstaluj: python -m pip install git-filter-repo, a potem podaj pełną ścieżkę w parametrze -FilterRepoPath lub dodaj do PATH."
}

Write-Host "[1/4] Usuwam node_modules (z katalogu roboczego, jeśli istnieje)" -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules, dist, out, release -ErrorAction SilentlyContinue

Write-Host "[2/4] Czyszczę historię z node_modules/ (w tym electron.exe)" -ForegroundColor Cyan
& $exe --invert-paths --path node_modules/ | Out-Default

Write-Host "[3/4] Oczyszczam bazę obiektów (git gc)" -ForegroundColor Cyan
git gc --prune=now --aggressive

Write-Host "[4/4] Gotowe. Wypchnij zmiany z nadpisaniem historii (jeśli masz uprawnienia):" -ForegroundColor Green
Write-Host "    git push --force origin main" -ForegroundColor Yellow
Write-Host "    # albo: git push --force origin <twoja-galaz>" -ForegroundColor Yellow
