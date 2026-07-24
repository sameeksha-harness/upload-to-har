#!/usr/bin/env bash
# Manual test harness for upload-to-har.
# Reads connection details from .env.local, maps them to INPUT_* env vars,
# and runs node dist/index.js against a real HAR instance.
#
# Usage:
#   cp .env.local.example .env.local    # fill in real values
#   npm run build                        # compile dist/index.js
#   bash scripts/run-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

ENV_FILE="${REPO_ROOT}/.env.local"

# ─── pre-flight checks ────────────────────────────────────────────────────────

if ! command -v hc &>/dev/null; then
  echo ""
  echo "ERROR: 'hc' (harness CLI) is not installed or not on PATH."
  echo ""
  echo "Install it with:"
  echo "  curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sh"
  echo ""
  echo "Or with sudo:"
  echo "  curl -fsSL https://raw.githubusercontent.com/harness/harness-cli/v2/install | sudo sh"
  echo ""
  echo "Then re-run this script."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "ERROR: $ENV_FILE not found."
  echo ""
  echo "Create it by copying the example template:"
  echo "  cp .env.local.example .env.local"
  echo ""
  echo "Then fill in your real values and re-run."
  exit 1
fi

DIST_FILE="${REPO_ROOT}/dist/index.js"
if [ ! -f "$DIST_FILE" ]; then
  echo ""
  echo "ERROR: dist/index.js not found. Build the action first:"
  echo "  npm run build"
  echo ""
  exit 1
fi

# ─── load env ─────────────────────────────────────────────────────────────────

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${HAR_API_URL:?'HAR_API_URL must be set in .env.local'}"
: "${HAR_ACCOUNT:?'HAR_ACCOUNT must be set in .env.local'}"
: "${HAR_TOKEN:?'HAR_TOKEN must be set in .env.local'}"
: "${HAR_REGISTRY:?'HAR_REGISTRY must be set in .env.local'}"
: "${HAR_TYPE:?'HAR_TYPE must be set in .env.local'}"
: "${HAR_FILE:?'HAR_FILE must be set in .env.local'}"
: "${HAR_NAME:?'HAR_NAME must be set in .env.local'}"
: "${HAR_VERSION:?'HAR_VERSION must be set in .env.local'}"

if [ ! -f "$HAR_FILE" ]; then
  echo ""
  echo "ERROR: HAR_FILE='$HAR_FILE' does not exist."
  echo ""
  echo "Create a test file, e.g.:"
  echo "  echo 'test content' > /tmp/test-artifact.txt"
  echo "  HAR_FILE=/tmp/test-artifact.txt"
  exit 1
fi

# ─── map to GitHub Actions INPUT_* env vars ───────────────────────────────────
# @actions/core getInput(name) looks up INPUT_<NAME> where <NAME> is the input
# name uppercased with spaces→underscores — but dashes are kept as dashes.
# So "api-url" → INPUT_API-URL  (NOT INPUT_API_URL).
# Bash cannot export variables containing dashes, so we pass them inline via
# the `env` command on the node invocation below instead of using `export`.
INPUT_VARS=(
  "INPUT_API-URL=$HAR_API_URL"
  "INPUT_ACCOUNT=$HAR_ACCOUNT"
  "INPUT_TOKEN=$HAR_TOKEN"
  "INPUT_REGISTRY=$HAR_REGISTRY"
  "INPUT_TYPE=$HAR_TYPE"
  "INPUT_FILE=$HAR_FILE"
  "INPUT_NAME=$HAR_NAME"
  "INPUT_VERSION=$HAR_VERSION"
  "INPUT_EXTRA-ARGS=${HAR_EXTRA_ARGS:-}"
)

# ─── summary header ───────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  upload-to-har  — manual test run"
echo "═══════════════════════════════════════════════════════════"
echo "  API URL  : $HAR_API_URL"
echo "  Account  : $HAR_ACCOUNT"
echo "  Registry : $HAR_REGISTRY"
echo "  Type     : $HAR_TYPE"
echo "  File     : $HAR_FILE"
echo "  Name     : $HAR_NAME"
echo "  Version  : $HAR_VERSION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── run ──────────────────────────────────────────────────────────────────────

# Capture all output so we can show the parsed result at the end.
# Using 'tee' so output is still visible live.
OUTPUT_FILE="$(mktemp)"
set +e
env "${INPUT_VARS[@]}" node "$DIST_FILE" 2>&1 | tee "$OUTPUT_FILE"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# ─── result summary ───────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "  RESULT  : SUCCESS (exit 0)"
  # GitHub Actions sets outputs via ::set-output:: or the newer $GITHUB_OUTPUT.
  # In local mode, core.setOutput writes "::set-output name=registry-path::<value>"
  # to stdout. Extract it for the summary.
  REGISTRY_PATH=$(grep -oP '(?<=::set-output name=registry-path::).*' "$OUTPUT_FILE" || true)
  if [ -n "$REGISTRY_PATH" ]; then
    echo "  Output  : registry-path=${REGISTRY_PATH}"
  fi
else
  echo "  RESULT  : FAILED (exit $EXIT_CODE)"
fi
echo "  API URL : $HAR_API_URL"
echo "═══════════════════════════════════════════════════════════"
echo ""

rm -f "$OUTPUT_FILE"
exit "$EXIT_CODE"
