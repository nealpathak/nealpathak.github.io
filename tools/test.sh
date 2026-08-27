#!/usr/bin/env bash
# The test suite.
#
# There is no unit-test framework here. Instead each script under tools/tests/
# is evaluated inside a real page with the game running, after the render loop
# has been taken off requestAnimationFrame and driven by hand at a steady 60Hz.
# That means combat, progression and AI are exercised against the actual game,
# deterministically, in a couple of seconds, without depending on how fast the
# machine can draw.
set -u
cd "$(dirname "$0")/.."

# A suite can ask for a different browser than the default by declaring it on a
# line of its own, e.g.
#   // @env EW_TOUCH=1 EW_VIEW=390x844 EW_Q=?autostart=1&touch=1
# which is how the touch suite gets a phone-shaped page with a coarse pointer.
fail=0
for f in tools/tests/*.js; do
  name=$(basename "$f" .js)
  printf '\n=== %s ===\n' "$name"
  envline=$(sed -n 's|^// *@env *||p' "$f" | head -1)
  out=$(env EW_Q='?autostart=1' $envline node tools/harness.mjs /tmp/emberwake-test.png 300 "$f" 2>&1)
  echo "$out" | sed -n '/\[eval\]/,$p' | head -60
  if echo "$out" | grep -qE '\[eval-error\]|\[pageerror\]|\[error\]|"error":'; then
    echo "FAILED: $name"
    fail=1
  fi
done

echo
[ $fail -eq 0 ] && echo "all suites ran clean" || echo "one or more suites reported an error"
exit $fail
