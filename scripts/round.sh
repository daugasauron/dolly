#!/usr/bin/env bash
# The round of docs/deployment.md's release step 1, on this checkout:
#   scripts/round.sh [FIRST [LAST]]   the stages from FIRST (default seed) to LAST (default gpu)
#   scripts/round.sh verdict          whether the round passed on HEAD
# The stages, in order:
#   seed      the runtime, the Rust and Go seeds, the recipes' pins
#   images    the catalog, built again until its pins hold
#   compiler  the seed's compiler is the one llvm-cc linked: a fixed point
#   lint      the Dollyfiles
#   suites    source, artifacts, the browser suite in Chrome and Firefox, every demo
#   gpu       the tests that need a hardware adapter in a window, on the X display
#             DOLLY_GPU_DISPLAY, each under flock(1) on DOLLY_GPU_LOCK when it is set
# A stage that changes pins commits them. Each prints its time and status here, its output going
# to build/round/STAGE.log; one that passes notes the commits it started and ended on in
# build/round/STAGE.passed. The round has passed on HEAD when every stage passed, each starting
# on the commit the one before it ended on, the last ending on HEAD, with the tree clean.
# The machine's own settings (the unit, its memory cap, DOLLY_IMAGE_JOBS, the display) are the caller's.
set -uo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_dir}"
stages=(seed images compiler lint suites gpu)
out=build/round
mkdir -p "${out}"
# No test opens a window on the desktop of whoever runs this.
unset DISPLAY

verdict() {
  local previous="" start end
  for stage in "${stages[@]}"; do
    read -r start end 2>/dev/null < "${out}/${stage}.passed" || { echo "dolly: the round's ${stage} has not passed"; return 1; }
    [[ -z "${previous}" || "${start}" == "${previous}" ]] || { echo "dolly: the round's ${stage} ran on ${start:0:9}, not on ${previous:0:9}"; return 1; }
    previous="${end}"
  done
  [[ "${previous}" == "$(git rev-parse HEAD)" ]] || { echo "dolly: the round passed on ${previous:0:9}, not on HEAD"; return 1; }
  [[ -z "$(git status --porcelain)" ]] || { echo "dolly: the tree has changes the round did not test"; return 1; }
  echo "dolly: the round passed on ${previous}"
}
if [[ "${1:-}" == verdict ]]; then verdict; exit; fi

first="${1:-seed}" last="${2:-gpu}"
[[ " ${stages[*]} " == *" ${first} "* && " ${stages[*]} " == *" ${last} "* ]] ||
  { echo "usage: round.sh [FIRST [LAST]] | verdict; stages: ${stages[*]}" >&2; exit 64; }
[[ -z "$(git status --porcelain)" ]] || { echo "dolly: the round needs a clean tree" >&2; exit 1; }

log() { echo "== $* $(date +%H:%M)"; }
# Commits what the pins changed, in the recipes and config/source-pins.sh.
commit_pins() {
  [[ -n "$(git status --porcelain)" ]] || return 0
  git add -u -- ':(glob)**/Dollyfile*' config/source-pins.sh
  [[ -z "$(git status --porcelain | grep -v '^M  ')" ]] || { echo "dolly: the stage changed more than pins:"; git status --porcelain; return 1; }
  git commit -q -m "$1" && log "committed $(git rev-parse --short HEAD): $1"
}
seed_compiler() { sed -n 's/^DOLLY_SEED_COMPILER_SHA256=//p' config/source-pins.sh; }
# The stages' steps: each runs to its end and fails on any step that failed.
stage_seed() {
  npm run build:runtime && bash demos/rust/build-rust-toolchain.sh && bash demos/go/build-go-toolchain.sh &&
    npm run build:runtime && bash scripts/prepare-image-sources.sh && node scripts/update-recipe-pins.mjs --sources &&
    node scripts/update-recipe-pins.mjs && commit_pins "Recipes: pinned for the round"
}
stage_images() {
  for pass in 1 2 3; do
    npm run image && node scripts/update-recipe-pins.mjs || return 1
    [[ -n "$(git status --porcelain)" ]] || return 0
    commit_pins "Recipes: pinned as the round built them" || return 1
  done
  echo "dolly: the pins changed on each of three passes"
  return 1
}
stage_compiler() {
  local before after
  before="$(seed_compiler)"
  node demos/llvm/pin-seed-compiler.mjs || return 1
  after="$(seed_compiler)"
  if [[ "${after}" != "${before}" ]]; then
    commit_pins "Seed compiler: ${after:0:8}, as llvm-cc linked it; not yet a fixed point"
    echo "dolly: the seed's compiler changed from ${before:0:8} to ${after:0:8}: a round on it is next"
    return 1
  fi
  # The same compiler: its URL may name a new version.
  commit_pins "Seed compiler: the fixed point ${after:0:8}, at this version's release"
}
stage_lint() { npm run -s lint:dollyfiles; }
stage_suites() {
  local failed=0
  npm run -s test:source || failed=1
  npm run -s test:artifacts || failed=1
  node test/browser-tests.mjs chromium firefox || failed=1
  node demos/run-browser-tests.mjs || failed=1
  return "${failed}"
}
stage_gpu() {
  [[ -n "${DOLLY_GPU_DISPLAY:-}" ]] || { echo "dolly: DOLLY_GPU_DISPLAY names no X display with a hardware adapter"; return 1; }
  local options=(--display="${DOLLY_GPU_DISPLAY}") failed=0
  [[ -z "${DOLLY_GPU_LOCK:-}" ]] || options+=(--lock="${DOLLY_GPU_LOCK}")
  node test/browser-tests.mjs "${options[@]}" || failed=1
  node demos/run-browser-tests.mjs "${options[@]}" || failed=1
  return "${failed}"
}

log "round from ${first} to ${last} on $(git rev-parse --short HEAD)"
running=0 failed=""
for stage in "${stages[@]}"; do
  [[ "${stage}" == "${first}" ]] && running=1
  [[ "${running}" == 1 ]] || continue
  start="$(git rev-parse HEAD)" began="${SECONDS}"
  rm -f -- "${out}/${stage}.passed"
  if "stage_${stage}" > "${out}/${stage}.log" 2>&1; then
    echo "${start} $(git rev-parse HEAD)" > "${out}/${stage}.passed"
    log "${stage} passed in $(((SECONDS - began) / 60)) min"
  else
    log "${stage} FAILED in $(((SECONDS - began) / 60)) min: ${out}/${stage}.log"
    failed="${failed} ${stage}"
    # The stages after a failed build or check would test what it did not make.
    [[ "${stage}" == suites ]] || break
  fi
  [[ "${stage}" == "${last}" ]] && break
done
[[ -z "${failed}" ]] || { log "round failed:${failed}"; exit 1; }
[[ "${last}" != gpu ]] || verdict
