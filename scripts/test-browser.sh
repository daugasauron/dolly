#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v google-chrome >/dev/null 2>&1; then
  chrome=google-chrome
elif command -v google-chrome-stable >/dev/null 2>&1; then
  chrome=google-chrome-stable
else
  echo "dolly: Google Chrome is required for the wasm64/table64 browser test" >&2
  exit 1
fi

if [[ -n "${DOLLY_BROWSER_MODE:-}" ]]; then
  exec node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
fi

node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=boundary \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=process-abi \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=slop \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=python-pi DOLLY_BROWSER_MODE=session \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=cpp \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=zig-single-provider \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
