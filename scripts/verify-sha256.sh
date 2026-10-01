#!/usr/bin/env bash
# Usage: verify-sha256.sh DIGEST FILE — fails unless FILE has exactly that SHA-256.
set -euo pipefail
[[ "$1" =~ ^[0-9a-fA-F]{64}$ ]] || { echo 'Expected a SHA-256 digest' >&2; exit 1; }
printf '%s  %s\n' "$1" "$2" | sha256sum --check --strict -
