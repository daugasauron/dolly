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

DOLLY_BROWSER_MODE=debugger-disconnect \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=menu \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=boundary \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=upload \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=custom-dollyfile \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=dollyfile-studio DOLLY_BROWSER_MODE=dollyfile-studio \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=bhop DOLLY_BROWSER_MODE=bhop \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=process-abi \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=process-smoke \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=process-lifecycle \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=libcurl-contract \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=git-transport \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=python DOLLY_BROWSER_MODE=python-process \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=image-inventory \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=image-retention \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=dollyfile-parser \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=v3-iteration \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=v3-missing-dependency \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=slop \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=utf8 \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=janis-files \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=pi DOLLY_BROWSER_MODE=janis-process \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=default DOLLY_BROWSER_MODE=terminal-ui \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=python-pi DOLLY_BROWSER_MODE=session \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_BROWSER_MODE=cpp \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=ghostty-build DOLLY_BROWSER_MODE=zig-sdk \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=cmake-build DOLLY_BROWSER_MODE=cmake \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
DOLLY_IMAGE=neovim DOLLY_BROWSER_MODE=neovim \
  node "${project_dir}/scripts/browser-harness.mjs" "${chrome}"
