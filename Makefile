# The plugin has no binary and needs no container: the tests, the dist build
# and the load check need only claude, jq and a POSIX shell on the host.
VERSION := $(shell cat VERSION)

.PHONY: test test-plugin test-manifests test-skill test-dist test-release dist verify-plugin validate

# Every check that runs without a model: the mod tests, the manifests as files,
# the dispatch skill as text, the dist tree and the release scripts.
test: test-plugin test-manifests test-skill test-dist test-release

test-plugin:
	claude plugin test plugin

test-manifests:
	scripts/test-manifests.sh

test-skill:
	scripts/test-skill.sh

test-dist:
	scripts/test-dist.sh

test-release:
	scripts/test-release.sh

# The tree CI publishes to the dist branch.
dist:
	rm -rf dist
	sh scripts/build-dist.sh dist

# Loads the plugin in a real Claude Code process, with no model spend, and fails
# unless its module loaded (with no engine installed, the types are hidden). Needs
# claude on PATH; run it before any push that touches plugin/.
verify-plugin:
	scripts/verify-plugin.sh

validate:
	claude plugin validate plugin
