#!/usr/bin/env bash
# Render the game headlessly and drop a screenshot.
#
#   tools/shot.sh out.png [waitMs] [eval.js]
#
# EW_Q sets a query string (e.g. EW_Q='?autostart=1'), EW_AFTER names a second
# script to evaluate after the wait.
set -u
cd "$(dirname "$0")/.."
exec node tools/harness.mjs "$@"
