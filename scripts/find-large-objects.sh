#!/usr/bin/env bash
set -euo pipefail

# Show the largest 20 objects in the Git history to help diagnose 100MB push errors.
# Usage: ./scripts/find-large-objects.sh

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

git rev-list --objects --all \
  | git cat-file --batch-check='%(objectsize:disk) %(objecttype) %(rest)' \
  | sort -nr \
  | head -n 20 \
  | awk '{printf "%9.2f MB  %s %s\n", $1/1024/1024, $2, $3}'
