#!/bin/sh
# Builds the dist tree into a temporary directory and checks that it holds
# what a release ships: the plugin without its tests, type files and tsconfig.json, plus
# LICENSE and README.md; no binary and no Go.
#
#   scripts/test-dist.sh
set -u

root=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/msgate-agents-dist.XXXXXX") || exit 2
trap 'rm -rf "$work"' EXIT
out=$work/dist
failures=0

if ! sh "$root/scripts/build-dist.sh" "$out" >"$work/build.log" 2>&1; then
  cat "$work/build.log" >&2
  echo "FAIL: build-dist.sh failed" >&2
  exit 1
fi

must_exist() {
  if [ -e "$out/$1" ]; then echo "ok: $1 is in dist"; else echo "FAIL: $1 is missing from dist" >&2; failures=$((failures + 1)); fi
}
must_not_exist() {
  if [ -e "$out/$1" ]; then echo "FAIL: $1 is in dist" >&2; failures=$((failures + 1)); else echo "ok: $1 is not in dist"; fi
}

must_exist .claude-plugin/plugin.json
must_exist hooks/hooks.json
must_exist hooks/register.js
must_exist hooks/agents.js
must_exist hooks/models.js
must_exist skills/dispatch/SKILL.md
must_exist LICENSE
must_exist README.md
must_not_exist tests
must_not_exist types
must_not_exist tsconfig.json
must_not_exist .claude-plugin/types
must_not_exist bin
must_not_exist libexec
must_not_exist SHA256SUMS

stray=$(find "$out" \( -name '*.test.ts' -o -name '*.d.ts' -o -name '*.go' \) | head -n 5)
if [ -n "$stray" ]; then
  echo "FAIL: dev files in dist:" >&2
  echo "$stray" >&2
  failures=$((failures + 1))
fi

[ "$failures" -eq 0 ]
