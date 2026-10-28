#!/bin/sh
# Builds the dist tree into a temporary directory and checks that it holds
# what a release ships: the plugin without its tests, type files and tsconfig.json, plus
# LICENSE and README.md; no binary and no Go. The dist manifest carries the version
# of VERSION; the source manifest carries none.
#
#   scripts/test-dist.sh
set -u

root=$(cd "$(dirname "$0")/.." && pwd -P)
if ! command -v jq >/dev/null 2>&1; then
  echo "test-dist: jq is not on PATH" >&2
  exit 2
fi
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

version=$(cat "$root/VERSION")
dist_version=$(jq -r '.version // empty' "$out/.claude-plugin/plugin.json")
if [ "$dist_version" = "$version" ]; then
  echo "ok: dist plugin.json carries version $version"
else
  echo "FAIL: dist plugin.json version is '$dist_version', VERSION is '$version'" >&2
  failures=$((failures + 1))
fi
if [ "$(jq 'has("version")' "$root/plugin/.claude-plugin/plugin.json")" = "false" ]; then
  echo "ok: the source plugin.json carries no version"
else
  echo "FAIL: the source plugin.json carries a version" >&2
  failures=$((failures + 1))
fi

# The script finds its repository from its own path, so a copy in a minimal
# repository shows what it does with a VERSION that is empty.
fake=$work/fake
mkdir -p "$fake/scripts" "$fake/plugin/.claude-plugin"
cp "$root/scripts/build-dist.sh" "$fake/scripts/"
cp "$root/plugin/.claude-plugin/plugin.json" "$fake/plugin/.claude-plugin/"
echo "licence" >"$fake/LICENSE"
echo "readme" >"$fake/README.md"
: >"$fake/VERSION"
if sh "$fake/scripts/build-dist.sh" "$work/fake-dist" >"$work/fake-build.log" 2>&1; then
  echo "FAIL: build-dist.sh built with an empty VERSION" >&2
  failures=$((failures + 1))
elif [ -e "$work/fake-dist" ]; then
  echo "FAIL: build-dist.sh left a dist tree behind for an empty VERSION" >&2
  failures=$((failures + 1))
else
  echo "ok: build-dist.sh refuses an empty VERSION"
fi

stray=$(find "$out" \( -name '*.test.ts' -o -name '*.d.ts' -o -name '*.go' \) | head -n 5)
if [ -n "$stray" ]; then
  echo "FAIL: dev files in dist:" >&2
  echo "$stray" >&2
  failures=$((failures + 1))
fi

[ "$failures" -eq 0 ]
