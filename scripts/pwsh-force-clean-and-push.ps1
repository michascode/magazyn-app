param(
    [string]$Remote = "origin",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

function Find-GitFilterRepo {
    $cmd = Get-Command git-filter-repo -ErrorAction SilentlyContinue
    if ($cmd) { return @{ Type = "exe"; Path = $cmd.Path } }

    $common = @(
        "$HOME\\AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python311\\Scripts\\git-filter-repo.exe",
        "$HOME\\AppData\\Local\\Programs\\Python\\Python311\\Scripts\\git-filter-repo.exe",
        "$HOME\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\git-filter-repo.exe"
    )

    foreach ($p in $common) {
        if (Test-Path $p) { return @{ Type = "exe"; Path = $p } }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{ Type = "python"; Path = $python.Path }
    }

    throw "Nie znaleziono git-filter-repo ani python w PATH. Zainstaluj: python -m pip install git-filter-repo i uruchom ponownie."
}

function Assert-CleanWorkingTree {
    $status = git status --porcelain
    if ($status) {
        throw "Najpierw zakoncz lokalne zmiany (commit/restore). Aktualny status:`n$status"
    }
}

function Ensure-OnBranch {
    $current = git branch --show-current
    if (-not $current) {
        throw "Nie mozna ustalic biezacej galezi."
    }
    if ($current -ne $Branch) {
        Write-Host "Przełączam na $Branch..."
        git checkout $Branch | Out-Null
    }
}

Assert-CleanWorkingTree
Ensure-OnBranch

$filterRepo = Find-GitFilterRepo
if ($filterRepo.Type -eq "python") {
    Write-Host "Uzywam python -m git_filter_repo (git-filter-repo zainstalowany jako modul)" -ForegroundColor Green
    & $filterRepo.Path -m git_filter_repo --invert-paths --path node_modules --path dist --path out --path release
} else {
    Write-Host "Uzywam git-filter-repo: $($filterRepo.Path)" -ForegroundColor Green
    & $filterRepo.Path --invert-paths --path node_modules --path dist --path out --path release
}

git gc --prune=now --aggressive

Write-Host "Gotowe. Wykonaj force-push:" -ForegroundColor Green
Write-Host "git push --force $Remote $Branch" -ForegroundColor Yellow
