#!/usr/bin/env bash
# Parse-check every source module. No build step in this project, so this is the
# closest thing we have to a compiler.
set -u
cd "$(dirname "$0")/.."
fail=0
tmp=$(mktemp -d)
while IFS= read -r f; do
  cp "$f" "$tmp/m.mjs"
  if ! out=$(node --check "$tmp/m.mjs" 2>&1); then
    echo "SYNTAX FAIL: $f"
    echo "$out" | sed -n '1,12p'
    fail=1
  fi
done < <(find src -name '*.js' | sort)
rm -rf "$tmp"
[ $fail -eq 0 ] && echo "syntax ok: $(find src -name '*.js' | wc -l) modules"
exit $fail
