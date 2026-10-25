#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required." >&2
  exit 2
fi
echo "=== LIMO-ThePark test harness ==="
python3 "$ROOT_DIR/tests/harness/run_harness.py" --root "$ROOT_DIR"
