#!/usr/bin/env bash
# Checks the two manifests and the hooks file as files: the plugin test runner
# reads none. The plugin manifest must declare no `dependencies` (the plugin
# finds the msgate engine at use, and an update to a version that adds a
# dependency leaves an existing install unloaded until someone installs the
# dependency by hand) and no `version` (the dist build writes it from VERSION).
#
# usage: scripts/test-manifests.sh [repo-root]
set -u

root=${1:-$(cd "$(dirname "$0")/.." && pwd)}
plugin=$root/plugin/.claude-plugin/plugin.json
market=$root/.claude-plugin/marketplace.json
hooks=$root/plugin/hooks/hooks.json
failures=0

if ! command -v jq >/dev/null 2>&1; then
  echo "test-manifests: jq is not on PATH" >&2
  exit 2
fi
for f in "$plugin" "$market" "$hooks"; do
  if ! jq -e . "$f" >/dev/null 2>&1; then
    echo "test-manifests: $f is missing or is not JSON" >&2
    exit 2
  fi
done

# check <description> <file> <jq filter that must print true>
check() {
  if [ "$(jq -r "$3" "$2")" != "true" ]; then
    echo "FAIL: $1" >&2
    failures=$((failures + 1))
  else
    echo "ok: $1"
  fi
}

check "plugin.json names msgate-agents" "$plugin" '.name == "msgate-agents"'
check "plugin.json declares no dependencies" "$plugin" 'has("dependencies") | not'
check "plugin.json carries no version" "$plugin" 'has("version") | not'
check "plugin.json is MIT with the repository links" "$plugin" '.license == "MIT" and .homepage == "https://github.com/JustAzul/msgate-agents" and .repository == "https://github.com/JustAzul/msgate-agents"'
check "plugin.json has a description" "$plugin" '(.description | type) == "string" and (.description | length) > 0'
check "marketplace.json is msgate-agents owned by JustAzul" "$market" '.name == "msgate-agents" and .owner == {"name": "JustAzul"}'
check "marketplace.json lists the one plugin from the dist branch, no sha" "$market" \
  '(.plugins | length) == 1 and .plugins[0].name == "msgate-agents" and .plugins[0].source == {"source": "github", "repo": "JustAzul/msgate-agents", "ref": "dist"}'
check "hooks.json loads the one module and runs no command" "$hooks" '. == {"modules": ["./register.js"]}'

[ "$failures" -eq 0 ]
