#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/diagnose-push.sh [size_mb]
# Gathers basic diagnostics for "pack exceeds file size limit" push errors.

THRESHOLD_MB="${1:-80}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not inside a git repository" >&2
  exit 1
fi

printf "=== Remotes ===\n"
git remote -v || true

current_branch=$(git rev-parse --abbrev-ref HEAD)
printf "\n=== Branch ===\n"
echo "Current branch: ${current_branch}"

printf "\n=== Working tree (>${THRESHOLD_MB}MB) ===\n"
./scripts/check-large-working-tree.sh "$THRESHOLD_MB"

printf "\n=== Largest objects in history (>${THRESHOLD_MB}MB) ===\n"
# List top objects and filter by threshold (size in bytes is column 3)
pack_dir="$(git rev-parse --git-dir)/objects/pack"
pack_output=""
if ls "$pack_dir"/*.idx >/dev/null 2>&1; then
  pack_output=$(git verify-pack -v "$pack_dir"/*.idx 2>/dev/null \
    | sort -k3 -n \
    | tail -n 200 \
    | awk -v limit_mb="$THRESHOLD_MB" '{ size_mb=$3/1024/1024; if (size_mb >= limit_mb) printf "%.2f MB\t%s\n", size_mb, $1 }')
fi

if [ -n "$pack_output" ]; then
  echo "$pack_output"
else
  echo "Brak dużych obiektów spakowanych lub brak plików .idx."
fi

printf "\n=== Count objects (Git wbudowane) ===\n"
git count-objects -vH

printf "\nDiagnoza zakończona. Jeśli nadal widzisz duże obiekty, usuń je z historii (np. git filter-repo) lub dodaj do Git LFS.\n"
