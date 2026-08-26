# Source this to point the harness at a Playwright install outside the repo.
#   . tools/env.sh
# Nothing here is committed as a symlink: GitHub Pages refuses to build a site
# that contains one pointing outside the repository.
for candidate in \
  "$HOME/.emberwake-tools/node_modules/playwright/index.js" \
  /tmp/claude-0/*/*/scratchpad/node_modules/playwright/index.js
do
  [ -f "$candidate" ] && export EW_PLAYWRIGHT="$candidate" && break
done
echo "EW_PLAYWRIGHT=${EW_PLAYWRIGHT:-unset}"
