---
name: dispatch
description: >
  Dispatch work to another AI coding agent (Codex today) through the msgate
  engine: second opinion, independent diff review, cross-check, expert-persona
  consult, delegated subtask, follow-ups, background jobs. Use whenever the user
  asks Codex, GPT or OpenAI to weigh in, review or do something, even before any
  code is attached. Trigger: "pergunta pro codex", "manda pro codex", "o que o
  codex acha", "ask codex", "codex review", "get a second opinion from GPT", "act
  as a senior X — use codex", "cross-check this", "delegate to codex", "msgate
  job", "follow up with the agent". Not for work Claude can just do (coding),
  in-session PR/MR review (cr), pre-deploy checks (ship-audit), risk analysis
  (premortem).
---

# Dispatch

Hand a question or a task to a second agent through `msgate`. It is an
independent voice: different training, different blind spots, none of this
session's context. Used well it catches design flaws, invented APIs and skipped
edge cases. Used reflexively it burns minutes and tokens repeating Claude's work.

## Pick the purpose

Match the user's intent. When two fit (second opinion vs delegation), ask the
user: they differ in sandbox, read-only vs workspace-write.

A purpose is a label for the run (`--purpose <name>`, or `purpose` on the `run`
tool). It selects nothing: the engine applies no model, effort or sandbox for a
purpose. The agent types of this plugin carry the settings below; every other
route (the CLI, the `run` tool) takes them as explicit flags. Without
`--sandbox` a run is read-only, and a run that writes needs `--sandbox
workspace-write`.

| Purpose | Use when | Model / effort / sandbox | Detail |
|---|---|---|---|
| `second-opinion` | judge a decision, plan or design already drafted; "segunda opinião" | gpt-6.1-sol / high / read-only | `references/second-opinion.md` |
| `code-review` | independent pass on a diff: uncommitted, vs a base, one commit | gpt-6.1-sol / high / read-only | `references/code-review.md` |
| `cross-check` | sanity pass on finished code, named by files; "what did I miss" | gpt-6.1-sol / high / read-only | `references/cross-check.md` |
| `expert-persona` | judgment question framed as a senior practitioner; "como um sênior de X" | gpt-6.1-sol / xhigh / read-only | `references/expert-persona.md` |
| `delegation` | well-scoped mechanical work; the only purpose that writes | gpt-6.1-sol / medium / workspace-write | `references/delegation.md` |
| `adhoc` | anything else | provider defaults / read-only | none |

Load only the reference for the chosen purpose. A user override always wins
(`--effort xhigh`, `--model <id>`, `--sandbox read-only`); say which override ran.
Through an agent type, an effort override is the Agent call's `effort` (see
below).

## Agent types, engine tools or CLI

With both plugins installed, dispatch through the **agent types**, one per
purpose: `msgate-agents:second-opinion`, `msgate-agents:code-review`,
`msgate-agents:cross-check`, `msgate-agents:expert-persona`,
`msgate-agents:delegation` and `msgate-agents:adhoc`. Call the Agent tool with
`subagent_type` set to one, a short `description` and the self-contained
`prompt`. Each runs its profile as an engine job and shows as a native
background agent: its row streams what the agent is doing, and its report
carries the output (cut at 64 KiB) ending in
`[msgate run <run_id> · conversation <conversation_id> · <outcome>]`.

- The types are offered only once this skill has loaded in the session, and only
  when the msgate engine plugin (1.x) is installed. When the session showed the
  notice `msgate-agents needs the msgate engine plugin 1.x`, no type is offered:
  tell the user to install the engine, and use the CLI if it is on the PATH.
- `msgate-agents:code-review` takes the review target as its whole prompt:
  `uncommitted`, `base <branch>` or `commit <sha>`.
- An `effort` in the Agent call replaces the profile's effort for that agent,
  its follow-ups included, with the engine 1.2.0 or later. Set it only when the
  user asks for an effort. These types run Codex, so pass `low`, `medium`,
  `high` or `xhigh`: Codex has no `max`, and a run asked for `max` fails. An
  older engine ignores the field and runs the profile's effort.
- A follow-up is a SendMessage to the agent; it continues the same
  conversation. If the agent answers that its conversation is no longer
  recorded, continue with the `run` tool and the conversation id from the
  trailer.
- Stopping the agent (TaskStop) cancels its run.
- An answer that starts with `msgate: the hand-off to the agent failed` is not
  the other agent's answer: report it as a failed dispatch, never as its
  opinion.

The engine also gives two tools, for what the agent types do not carry (a
model or sandbox other than the profile's, another provider, or an effort with
an engine before 1.2.0). By contract:

- `mcp__msgate__run`: `prompt` required; optional `conversation_id`, `purpose`,
  `provider`, `model`, `effort`, `sandbox`, `cwd`. Without `conversation_id` it
  starts a conversation, with it the next turn of that one. It always admits a
  job and returns `{conversation_id, run_id, continued}`; `continued` is true
  when it continued the conversation you gave. Pass `model`, `effort` and
  `sandbox` yourself: the purpose sets none of them.
- `mcp__msgate__jobs`: `action` is `list`, `status`, `result` or `cancel`;
  `run_id` is required except for `list`. `result` is cut at 64 KiB.

A job started with `run` posts a notice in the session
(`msgate job <run_id> (<purpose>, conversation <conversation_id>) finished: <outcome>`,
with ` (possibly repeated)` after the outcome when a restart may have delivered
it before) with the output inline when it is at most 8 KiB, otherwise its first
8 KiB plus the output path. Nothing to poll: launch, keep working, read the
notice.

Use the CLI when you need what neither carries: `--attr` and `annotate`,
`--timeout`, `--prompt-file`, `--json`, `--dry-run`, a foreground run, scripts,
or when the plugin is not loaded. All three reach the same runs and
conversations. A CLI run started with `--agent-feedback` (see
`references/cli.md`) shows in a band above the prompt while it works, and its
result stays with whoever started it.

## Run it from the CLI

The prompt is a positional argument, `-` for stdin (use a heredoc past a couple
of lines), or `--prompt-file <path>`. Exactly one source. The CLI applies no
profile, so every command below names `--model`, `--effort` and `--sandbox`.

**Job** (the default for every purpose: runs take minutes, and a job outlives
the call that started it):

```bash
msgate exec --purpose second-opinion --model gpt-6.1-sol --effort high --sandbox read-only --background --json - <<'PROMPT'
...the self-contained prompt...
PROMPT
# {"conversation_id": "c-...", "run_id": "r-...", "state": "running", ...}
msgate wait <run_id> --timeout 90 --json   # exit 5: still running, the run is untouched, wait again
msgate result <run_id>                     # prints the provider's final message
```

Without `--json`, `--background` prints the run id as its last line. `wait`
blocks until the run is terminal and exits with the run's exit code. To be
notified instead of polling, run `msgate wait <run_id>` through the Bash tool
with `run_in_background: true` and carry on.

The flags for each purpose:

| Purpose | Command and flags |
|---|---|
| `second-opinion` | `msgate exec --purpose second-opinion --model gpt-6.1-sol --effort high --sandbox read-only` |
| `code-review` | `msgate review --purpose code-review --model gpt-6.1-sol --effort high --sandbox read-only` plus one target |
| `cross-check` | `msgate exec --purpose cross-check --model gpt-6.1-sol --effort high --sandbox read-only` |
| `expert-persona` | `msgate exec --purpose expert-persona --model gpt-6.1-sol --effort xhigh --sandbox read-only` |
| `delegation` | `msgate exec --purpose delegation --model gpt-6.1-sol --effort medium --sandbox workspace-write` |
| `adhoc` | `msgate exec --purpose adhoc --sandbox read-only` (model and effort are the provider's defaults) |

**Foreground** when blocking is fine (short prompt, nothing else to do). The last
stdout line is the output path: `Read` it. Set `--timeout <seconds>`, because the
run lives and dies with the shell call holding it:

```bash
msgate exec --purpose cross-check --model gpt-6.1-sol --effort high --sandbox read-only --timeout 110 - <<'PROMPT'
...
PROMPT
```

Review takes a target and no prompt: `msgate review --purpose code-review
--model gpt-6.1-sol --effort high --sandbox read-only --uncommitted`, `--base
<branch>` or `--commit <sha>`. It takes `--background` the same way.

Exit codes, flags and diagnosing a failed run: `references/cli.md`.

## Continue a conversation

Every run belongs to a conversation. A follow-up sends the next turn to the same
provider session, so it keeps what was said:

```bash
msgate send <conversation_id> --background --json "Which of those risks is cheapest to remove?"
```

`<run_id>` works in place of the conversation id. A follow-up reuses the first
turn's purpose, model, effort, sandbox and directory; flags change that turn
only. One turn at a time per conversation (a second `send` while one runs exits
3). A conversation the provider never reported a session for cannot be resumed
(exit 6). `msgate conversations` lists them with status and turn count;
`msgate status` lists this session's recent runs. Through the tools, a
follow-up is `mcp__msgate__run` with the `conversation_id`; through an agent
type it is a SendMessage.

## Read the result

Take the output path from the engine's notice, the foreground run's last stdout
line, or `wait`'s output, and `Read` it; `msgate result <run_id>` prints the
same text, and `mcp__msgate__jobs` with `action: "result"` returns it to the
session. Check the outcome before trusting the text: `wait --json` and `status
<run_id> --json` report `outcome` (`error`, `empty`, `timeout`, `cancelled` or
`lost` mean the run did not deliver) and an `error_excerpt`.

A dispatch starts with zero shared context. The prompt names file paths,
pastes the snippet that matters, states the decision and Claude's current lean.
"Continue where we left off" fails; a follow-up to the conversation succeeds.

## After the run

1. **Quote with attribution**, so the user hears a second voice: "Codex says…",
   in the user's language.
2. **Disagree openly** when the take conflicts with yours: "I disagree with Codex
   here because…". Compare reasoning; capitulating or rubber-stamping is
   consensus theater.
3. **Do not apply the other agent's patches** to the workspace. Review-style
   purposes produce findings, not diffs to merge. Only `delegation` writes, and
   even then the user sees the diff before anything is committed.
4. **Record what you learn** about a run: tag it at dispatch with `--attr
   key=value`, or afterwards with `annotate`, which also works on a job that is
   still running:

```bash
msgate annotate <run_id> --attr-json 'review.findings={"total":3,"high":1}'
```

Keys are namespaced by convention (`review.findings`, `ticket`); `--attr` stores
a string, `--attr-json` any JSON value. The engine's tools carry no attributes,
so annotate after the fact.

## Cost awareness

A run takes minutes and spends reasoning tokens billed as output; effort drives
both. Raise it only when the problem is hard, not to be safe. Before a second
dispatch in a session ask whether it carries weight or is reflexive
double-checking. `msgate stats --days 7` shows volume, outcomes and duration by
purpose, and tokens with their cost; `msgate runs --days 7` emits every run as
JSONL for `jq`.
