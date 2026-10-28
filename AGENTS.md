# Working on msgate-agents

## Versions

`VERSION` holds a [Semantic Versioning 2.0.0](https://semver.org) version, and
the release step refuses anything else.

Every push to `main` publishes a new build of the plugin on the `dist` branch,
which is what users install. The build writes the content of `VERSION` as the
`version` of the dist `.claude-plugin/plugin.json`; the source manifest carries
none. The GitHub release and the `v<version>` tag are created only for the first
build of a version, so a change pushed without a version bump appears in no
release.

An installed copy updates only when that `version` changes, and each version is
cached under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Dist
builds between two releases therefore reach no installed copy until the next
`chore: release`. After a release, users run
`claude plugin marketplace update <marketplace>`, then
`claude plugin update msgate-agents@<marketplace>`, then `/reload-plugins`.

Every change to the plugin therefore bumps `VERSION` in the same
push, as Semantic Versioning defines it, with the public API being the
documented contract (commands, flags, exit codes, JSON outputs, persisted
formats, the mod's tools):

- an incompatible change to that contract bumps the major (`1.4.2` → `2.0.0`),
  or the minor while the major is `0` (`0.4.1` → `0.5.0`), since Semantic
  Versioning lets a `0.y.z` version change anything at any time;
- a new feature that keeps it compatible bumps the minor: `0.4.1` → `0.5.0`;
- a compatible fix bumps the patch: `0.4.0` → `0.4.1`.

`1.0.0` declares the contract stable, so it is released only when the
repository owner asks for it, never as the next bump after an incompatible
change.

A version with a pre-release part, such as `0.5.0-rc.1`, is published as a
GitHub pre-release.

The bump is its own commit, `chore: release <version>`, which changes only
`VERSION` and is the last commit of the push. The release notes leave that
commit out and list the others since the previous version.

Anything under `plugin/` or `scripts/build-dist.sh` changes the build and
needs a bump. A change limited to
`README.md`, `docs/`, tests, the CI workflows or the release scripts does not.

## Before pushing a change to the plugin

A change under `plugin/` can leave the mod unable to load, and then every hook
of the plugin is gone for the whole session: the agent types are not registered
and none is offered. The plugin tests cannot see it: a test's `$` carries only
the engine's own interfaces, and the msgate engine's interface is faked there.

Run `make verify-plugin` before every push that touches `plugin/`. It starts
`claude -p` with this plugin, in a temporary directory with no session kept, no
msgate engine and a main model that does not exist, so nothing is spent on a
model; it reads the debug log and fails unless the module loaded and the six
agent types registered. Run `make test` too: it holds the mod tests
(`claude plugin test plugin`), the manifest checks (the plugin manifest must
declare no `dependencies`) and the check of the dist tree. The mod reads the
engine only through `$.msgate`; it never runs the `msgate` binary.

With the engine, the check is blind to the hidden `run` type: that type is
registered and backed only when an engine of version 1.1 or later is present.
Set `MSGATE_ENGINE_DIR` to an engine plugin directory (a dist build with
`.claude-plugin/plugin.json` and `bin/msgate`) and `make verify-plugin` runs a
second check after the first: it loads both plugins the same way, with no model
spend, and fails unless the module loaded, the six types and
`msgate-agents:run` registered, and the plugin did not say the engine is
missing. An engine below 1.1 fails the check and says so. The engine runs with
a temporary home, so it writes nothing under `~/.local/state/msgate` or
`~/.local/bin`, and the directory itself is only read. With `MSGATE_ENGINE_DIR`
unset, one line says the engine check was skipped and the exit status is the
first check's.
