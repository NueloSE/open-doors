#!/usr/bin/env bash
# Title card for the demo recording. Prints a banner and holds the terminal.
#   ./scripts/banner.sh          banner, then waits for a keypress
#   ./scripts/banner.sh --quiet  banner only, no prompt

set -u

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C='\033[38;5;80m'   # petrol — the tool's accent
  A='\033[38;5;173m'  # warm amber for the door
  D='\033[2m'; B='\033[1m'; R='\033[0m'
else
  C=''; A=''; D=''; B=''; R=''
fi

clear
printf '\n\n'
printf "${C}   ██████  ██████  ███████ ███    ██${R}     ${C}██████   ██████   ██████  ██████  ███████${R}\n"
printf "${C}  ██    ██ ██   ██ ██      ████   ██${R}     ${C}██   ██ ██    ██ ██    ██ ██   ██ ██     ${R}\n"
printf "${C}  ██    ██ ██████  █████   ██ ██  ██${R}     ${C}██   ██ ██    ██ ██    ██ ██████  ███████${R}\n"
printf "${C}  ██    ██ ██      ██      ██  ██ ██${R}     ${C}██   ██ ██    ██ ██    ██ ██   ██      ██${R}\n"
printf "${C}   ██████  ██      ███████ ██   ████${R}     ${C}██████   ██████   ██████  ██   ██ ███████${R}\n"
printf '\n'
printf "  ${B}See what can spend your tokens without asking you again — and close it.${R}\n\n"
printf "  ${D}An AI agent for Binance Agent OS. Ranks standing token approvals by${R}\n"
printf "  ${D}money actually at risk, not by how alarming they look.${R}\n\n"
printf "  ${A}▸${R} ${D}npx open-doors --demo${R}\n"
printf "  ${A}▸${R} ${D}github.com/NueloSE/open-doors${R}\n"
printf '\n'

if [ "${1:-}" != "--quiet" ]; then
  printf "  ${D}(press any key to begin)${R}"
  read -r -n 1 -s 2>/dev/null || read -r _ 2>/dev/null || true
  clear
fi
