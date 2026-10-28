#!/bin/sh
# Build the dist tree: the plugin content without its development files, plus
# LICENSE and README.md. There is no binary: the plugin is JavaScript and a
# skill. Runs in CI and in `make dist`.
#
#   scripts/build-dist.sh <outdir>
#
# The version in the dist manifest is the content of the VERSION file: the source
# manifest carries none, and an installed copy updates only when this version
# changes.
set -eu

die() {
  echo "build-dist: $*" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || die "jq is not on PATH"
[ $# -eq 1 ] || die "usage: build-dist.sh <outdir>"
root=$(cd "$(dirname "$0")/.." && pwd -P)
cd "$root"

version=$(cat VERSION)
[ -n "$version" ] || die "VERSION is empty"

out=$1
if [ -e "$out" ]; then
  [ -d "$out" ] || die "$out exists and is not a directory"
  [ -z "$(ls -A "$out")" ] || die "$out is not empty"
fi
mkdir -p "$out"
out=$(cd "$out" && pwd -P)

cp -R plugin/. "$out/"
manifest=$out/.claude-plugin/plugin.json
jq --arg v "$version" '. + {version: $v}' "$manifest" >"$manifest.tmp" || die "cannot write the version into the manifest"
mv "$manifest.tmp" "$manifest"
# The mod tests, the type declarations (the plugin's own contract and the ones
# Claude Code generates beside the mod) and tsconfig.json are development
# files; they are not part of the shipped plugin.
rm -rf "$out/tests" "$out/types" "$out/.claude-plugin/types" "$out/tsconfig.json"
cp LICENSE README.md "$out/"
echo "build-dist: wrote $out (version $version)"
