#!/usr/bin/env bash
# Serialize and de-prioritize expensive validation tasks on the small shared VM.
set -euo pipefail

lock_file="${HERMES_HEAVY_LOCK:-/tmp/hermes-project-heavy.lock}"
mkdir -p "$(dirname "$lock_file")"

if [[ "${HERMES_HEAVY_LOCK_HELD:-0}" != 1 ]]; then
  exec 9>"$lock_file"
  if ! flock -w "${HERMES_HEAVY_LOCK_TIMEOUT:-120}" 9; then
    echo "Another project validation task is running; refusing to overlap." >&2
    exit 75
  fi
  export HERMES_HEAVY_LOCK_HELD=1
fi

echo "[heavy-task] lock acquired; running on CPU 0 with low priority: $*" >&2
exec nice -n "${HERMES_HEAVY_NICE:-12}" ionice -c 3 taskset -c 0 "$@"
