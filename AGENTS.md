# Working on msgate-agents

## Versions

`VERSION` holds a [Semantic Versioning 2.0.0](https://semver.org) version, and
the release gate refuses anything else.

Before cutting a release or changing the version, fetch and follow https://raw.githubusercontent.com/JustAzul/agent-docs/main/plugin-releasing-dist.md (`curl -fsSL`; it always serves the latest version). If the fetch fails, stop and tell the owner; never release without it.

A push to `main` publishes nothing; only a release commit does, and the guide defines it.

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
