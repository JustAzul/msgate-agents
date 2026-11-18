# CLI reference

## Exit codes

`msgate` exits with the provider's own code, except:

| Code | Meaning |
|---|---|
| 2 | usage error caught before spawning (bad flag, no or two prompt sources, review with a prompt, reserved native flag, unsupported capability) |
| 3 | conversation busy, or `result` on a run that is not finished (the message names `wait`) |
| 4 | run or conversation not found |
| 5 | `wait` hit its own `--timeout`; the run is left running |
| 6 | conversation not resumable (no provider session id yet) |
| 70 | internal error, or a job whose worker never reached running |
| 124 | provider timed out (`--timeout`) |
| 125 | job lost (its worker died) |
| 127 | provider binary not found |
| 130 | run cancelled by request |
| 128+n | `msgate` itself ended by signal n |

With `--json` every exit prints one JSON object (`sdk_status`, `exit_code`,
`error`, plus ids), so a provider exit 2 is distinguishable from a usage error.

Provider auth failures surface as that run's error. Tell the user to log in to
the provider themselves; do not attempt it for them.

## Flags worth knowing

Shared by `exec`, `review` and `send`:

- `--provider` (default `codex`; a conversation keeps the provider it started
  with), `--purpose` (a label for the run, default `adhoc`; it selects no model,
  effort or sandbox), `--model`, `--effort`, `--sandbox` (`read-only` or
  `workspace-write`; read-only when not passed), `--cwd`.
- `--settings-source <flag|profile>` (default `flag`): where the model, effort
  and sandbox you passed are recorded as coming from; a caller that applies a
  profile of its own passes `profile`.
- `--timeout <seconds>`: kill the provider after this long (no default).
- `--attr key=value`, `--attr-json key=<json>` (repeatable): consumer attributes.
- `--clean-sentinel <text>` and `--material-label <label>`: outcome becomes
  `clean` when the whole output equals the sentinel (case and whitespace
  ignored), otherwise the label (default `ok`). Use them when "nothing to report"
  is a known sentence.
- `--run-id <id>`: choose the run id (letters, digits, `.`, `_`, `-`; must be new).
- `--agent-feedback` (or `MSGATE_AGENT_FEEDBACK=1`): show the run in the band
  above the prompt of its Claude Code session while it works: its purpose,
  source, elapsed time and newest step. It needs a session id (`--session-id`,
  else `$CLAUDE_CODE_SESSION_ID`); without one the run goes ahead unflagged and
  stderr says why. Nothing about the run is handed to Claude: whoever started
  the run delivers its result.
- `--dry-run`: print the resolved plan as JSON and execute nothing.
- `--json`: one JSON object instead of the output path.
- `-- <native flags>`: passed to the provider. `-o`, `--json`, `-C`, `-m`, `-s`,
  `-p`, `--ephemeral`, `--dangerously-*` and `-c` overrides of model, effort,
  profile or sandbox are refused (exit 2); use the msgate flags instead.
  `--sandbox danger-full-access` is refused too.

The working-directory git check is automatic: msgate adds the provider's
skip-git-repo-check flag when `--cwd` is not inside a git work tree, so a purely
conceptual question needs no extra flag.

## Where a run lives

`--json` output carries `run_dir`. Under it: `prompt.md` (what was sent),
`output.md` (the final message), `state.json`, `stderr.tail` (the last 64 KiB of
provider stderr; read it first when a run errors), `request.json`,
`progress.jsonl` (what the provider did while it worked), and for a job
`worker.log` (the worker's own diagnostics). The home is
`$MSGATE_HOME`, else `$XDG_STATE_HOME/msgate`, else `~/.local/state/msgate`.

## Reading history

- `msgate status [run_id] [--json]`: one run, or this session's 20 most
  recent (jobs and foreground).
- `msgate conversations [--json]`: provider, turns, busy/idle, last activity.
- `msgate cancel <run_id> [--json]`: stop a queued or running run (it ends
  `cancelled`, 130); on a finished run it changes nothing and exits 0.
- `msgate progress <run_id> [--from N] [--json]`: what the provider has done
  so far (commands it started, text it wrote); `--json` returns `next`, to pass
  back as `--from` to read only what is new, plus `usage` and `cost_usd`, what
  the run has used and cost so far (null until the provider reports usage).
- `msgate runs [--days N | --all] [--session-id ID]`: folded telemetry, one
  JSON object per run, with `model_used`/`effort_used` (what the provider ran
  with) beside the requested `model`/`effort`.
- `msgate stats [--days N | --all] [--session-id ID] [--json]`: totals,
  outcomes, durations, runs by purpose and origin (`by_purpose`, each purpose
  split into `cli` and `plugin` runs, with outcomes and review findings),
  tokens in total and per model (`usage_by_model`), and their cost in US
  dollars at API list prices (`cost_usd`; `cost_complete` is false when some
  model has no price).
- `msgate result <run_id | output path> [--report]`: the output of a finished
  run; `--report` prints a delivery report instead (a header with the purpose,
  model and outcome, the output with tag-shaped text escaped, and the run's
  trailer). Exit 5 for a run that is not terminal, 4 for an unknown run.
- `msgate eta --purpose NAME [--cwd DIR] [--json]`: how long a run of the
  purpose usually takes, the mean duration of its runs in the same git
  repository, else the mean of each repository's mean, as one line
  (`ETA ~2m 36s (repo average, 12 runs)`); `--json` returns `sdk_status`,
  `exit_code`, `purpose`, `repo`, `basis` (`repo`, `global` or `none`),
  `eta_ms` (null with no history), `samples` and `repos`.
- `msgate prices [--json]` / `msgate prices refresh [--max-age 24h] [--json]`:
  the cached model prices the cost uses, and refreshing them from the public
  price list (exit 7 when it cannot be read; the cache is kept).
