# msgate-agents

[![ci](https://github.com/JustAzul/msgate-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/JustAzul/msgate-agents/actions/workflows/ci.yml)
[![dist](https://github.com/JustAzul/msgate-agents/actions/workflows/dist.yml/badge.svg)](https://github.com/JustAzul/msgate-agents/actions/workflows/dist.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**`msgate-agents` is a Claude Code plugin that gives Claude six ready-made
agents: a second opinion, a code review, a cross-check, an expert persona,
delegated work and an open question for another agent (Codex today).** Claude
calls them through the Agent tool; each one shows as a native background agent
whose row streams what the other agent is doing, and whose report comes back to
Claude when the run ends. A SendMessage to the agent continues the same
conversation.

The plugin runs nothing itself. It registers the agent types, hands each type's
profile (model, effort, sandbox) to the **msgate engine plugin**, and ships the
dispatch skill that tells Claude when and how to use them. The engine runs the
other agent, records the run with its cost, and answers the agent's row. It
lives in [`JustAzul/cc-msgate`](https://github.com/JustAzul/cc-msgate); this
plugin never runs its binary.

This repository was named `agentcli` until the engine and the agents were split
into two plugins.

## Contents

- [Install](#install)
- [The six agents](#the-six-agents)
- [When the engine is missing](#when-the-engine-is-missing)
- [The hidden run row](#the-hidden-run-row)
- [The dispatch skill](#the-dispatch-skill)
- [State after the rename](#state-after-the-rename)
- [Working on the plugin](#working-on-the-plugin)
- [License](#license)

## Install

`msgate-agents` needs the msgate engine plugin, version 1.x. Add both
marketplaces and install both plugins:

```sh
claude plugin marketplace add JustAzul/cc-msgate
claude plugin marketplace add JustAzul/msgate-agents
claude plugin install msgate@cc-msgate
claude plugin install msgate-agents@msgate-agents
```

Neither plugin declares the other as a dependency: this one looks for the engine
when the session starts. Restart Claude Code after installing. The engine needs
the provider CLI on `PATH` and logged in (`codex` for the Codex provider); see
its README.

### Update

```sh
claude plugin marketplace update msgate-agents
claude plugin update msgate-agents@msgate-agents
```

Restart Claude Code to load the new version.

## The six agents

Call the Agent tool with `subagent_type` set to `msgate-agents:<type>`, a short
`description` and a prompt that stands on its own: the agent sees nothing of the
session. The profile of each type is handed to the engine at every session
start.

| Type | Use when | Model | Effort | Sandbox |
|---|---|---|---|---|
| `second-opinion` | judge a decision, plan or design already drafted | gpt-6.1-sol | high | read-only |
| `code-review` | an independent review of a diff; the prompt is the target: `uncommitted`, `base <branch>` or `commit <sha>` | gpt-6.1-sol | high | read-only |
| `cross-check` | look over finished code, named by file, for what was missed | gpt-6.1-sol | high | read-only |
| `expert-persona` | a judgment question answered as a senior practitioner of a field | gpt-6.1-sol | xhigh | read-only |
| `delegation` | well-scoped mechanical work; the only type that writes files | gpt-6.1-sol | medium | workspace-write |
| `adhoc` | anything else | provider default | provider default | read-only |

The types are offered to Claude only once the dispatch skill has loaded in the
session, and only when the engine was found. Each description says the type is
used only when the user asks for another agent.

If the engine fails to answer a request, the type's fallback (a Haiku model
with only the `Read` tool) answers `msgate: the hand-off to the agent failed, so
this is not its answer.`, so a failed hand-off never passes for the other
agent's opinion.

## When the engine is missing

At session start the plugin asks the engine for its version. When the engine is
not installed, refuses the call, or is not version 1.x, the session shows one
notice, `msgate-agents needs the msgate engine plugin 1.x` (followed by the
version found, if any), and none of the six types is offered. When the engine
refuses the profile of one type, that type alone is hidden and the refusal goes
to the debug log.

## The hidden run row

With a msgate engine from 1.1 on, the plugin also registers a seventh type,
`msgate-agents:run`. It is not one of the six agents and Claude never picks it:
it is offered to no model, whether or not the dispatch skill has loaded. It
exists only so that a run started outside an agent (from the command line, say)
and flagged for agent feedback can show as a row in the agent list. The engine
answers that row with the run's progress and its outcome.

Every 5 seconds the plugin asks the engine for the flagged runs that have no row
yet and opens one row per run, with the prompt `msgate run <run_id>` and the
description `<purpose> · <source>`. A run is tried once per session: when the
engine refuses the row (it does not open one in the auto permission mode) or the
call fails, the reason goes to the debug log, one line for that run, and the run
is not tried again. A run with no row keeps showing in the band above the prompt.

With an engine at 1.0.x the type is not registered, the plugin starts no timer
and the band alone shows the runs.

## The dispatch skill

`msgate-agents:dispatch` teaches Claude to pick the right agent, to write a
prompt that carries its own context, to continue a conversation, to read a
result, and to report another agent's findings with attribution and open
disagreement instead of applying its patches. It also covers the engine's
`run` and `jobs` tools and the `msgate` command line, with the explicit
`--model`, `--effort` and `--sandbox` each purpose needs, since the command line
applies no profile.

## State after the rename

Moving from the `agentcli` plugin to `msgate` and `msgate-agents` starts their
Claude Code state empty under the new names:

- the engine's `summaries` setting returns to its default, on;
- an agent row of the old plugin cannot be continued;
- finish notices the old plugin had not delivered are not carried over: their
  results stay readable with `msgate result <run_id>`.

## Working on the plugin

The plugin is JavaScript and a skill. There is no binary, no Go and no
container to build.

```sh
make test           # mod tests (claude plugin test), manifests, dist tree
make verify-plugin  # loads the plugin in a model-free claude -p
make dist           # builds the tree CI publishes to the dist branch, in dist/
```

`make test` needs `claude` and `jq` on the PATH. Run `make test` and `make
verify-plugin` before every push that touches `plugin/`: a module that fails to
load takes the plugin's hooks with it for the whole session. See `AGENTS.md` for
the versioning rule.

CI runs the PII scan on the tracked files and on the built `dist` tree, using
the scanner of the engine repository at a pinned version.

## License

MIT. See [LICENSE](LICENSE).
