#!/usr/bin/env bash
set -euo pipefail

dir_root="$(git rev-parse --show-toplevel)"
cd "$dir_root"

threshold_mb=${1:-90}
threshold_bytes=$((threshold_mb * 1024 * 1024))

find . -type f -size +${threshold_bytes}c -not -path "./.git/*" \
  -printf "%f\t%p\t%k KB\n" \
  | sort -k3 -n \
  | awk -v th="$threshold_mb" 'BEGIN {found=0} {found=1; printf "%.2f MB\t%s\n", $3/1024, $2} END { if (found==0) { printf "No files larger than %s MB found.\n", th } }'
