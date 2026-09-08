#!/usr/bin/env bash
# Sign in to Binance Agentic Wallet in one step.
#
# Signing in is two commands, and the gap between them is the most common way to
# get stuck: `auth signin` creates a pairing, `auth verify` completes it. Approve
# on the phone without verify running and the app reports success while the
# machine stays signed out. This runs both, so that gap does not exist.

set -eu

if ! command -v baw >/dev/null 2>&1; then
  printf '\n  The Binance Agentic Wallet CLI is not installed.\n\n    npm install -g @binance/agentic-wallet\n\n'
  exit 1
fi

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then B=$'\033[1m'; D=$'\033[2m'; G=$'\033[32m'; R=$'\033[0m'
else B=''; D=''; G=''; R=''; fi

field() { printf '%s' "$1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('data',{}).get('$2',''))" 2>/dev/null || true; }

status=$(field "$(baw wallet status --json 2>/dev/null || echo '{}')" status)
if [ "$status" = "CONNECTED" ]; then
  printf '\n  %sAlready signed in.%s\n\n' "$G" "$R"
  exit 0
fi

out=$(baw auth signin --json 2>&1)
if [ "$(field "$out" status)" = "ALREADY_CONNECTED" ]; then
  printf '\n  %sAlready signed in.%s\n\n' "$G" "$R"
  exit 0
fi

id=$(field "$out" qrCodeId)
code=$(field "$out" pairingCode)
url=$(field "$out" urlForWeb)

if [ -z "$id" ]; then
  printf '\n  Sign-in could not start. The wallet reported:\n\n%s\n\n' "$out"
  exit 1
fi

printf '\n  %sPAIRING CODE:  %s%s\n\n' "$B" "$code" "$R"
printf '  Open this on your phone, or scan the QR it shows:\n'
printf '  %s%s%s\n\n' "$B" "$url" "$R"
printf '  %sCheck the code in the Binance app matches before you approve.%s\n' "$D" "$R"
printf '  %sWaiting — leave this running until it returns.%s\n\n' "$D" "$R"

if command -v open >/dev/null 2>&1; then open "$url" >/dev/null 2>&1 || true; fi

baw auth verify --qrCodeId "$id" --json || true

printf '\n  Confirming with the wallet, not the app:\n'
baw wallet status --json
