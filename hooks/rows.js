// The hidden `run` type and the rows it opens. Nothing here runs a model: the
// engine answers each row, and the type is offered to no model.
import { RUN_TYPE, hasRunRows, runBackArgs, runSpec } from './agents.js'

const POLL_MS = 5000

function messageOf(error) {
  return String(error && error.message ? error.message : error)
}

// openRunRows backs the hidden type with the engine and registers it, only
// when the engine can serve it. It returns whether the rows can be opened.
async function openRunRows($, version) {
  if (!hasRunRows(version)) return false
  try {
    await $.msgate.backType(runBackArgs())
    await $.agent.register(runSpec())
    return true
  } catch (error) {
    $.ui.log('msgate-agents: the hidden run type is not available: ' + messageOf(error), { to: 'debug' })
    return false
  }
}

// openRow opens the row of one run. A refusal or a failure is one log line for
// the run: the run has been marked tried before, so it is not asked again.
async function openRow($, run) {
  try {
    const result = await $.agent.spawn({
      subagentType: $.plugin.name + ':' + RUN_TYPE,
      prompt: 'msgate run ' + run.run_id,
      description: run.purpose + ' · ' + run.source,
    })
    if (result.deny !== undefined) logRefused($, run, result.deny)
  } catch (error) {
    logRefused($, run, messageOf(error))
  }
}

function logRefused($, run, reason) {
  $.ui.log('msgate-agents: no row opened for run ' + run.run_id + ': ' + reason, { to: 'debug' })
}

// The runs already tried in this session live in the session's state, not in
// the plugin's memory: a reload of the plugin keeps them. A run is tried once:
// the engine stops listing a run once it has a row, but a refused run never
// gets one and stays listed.
const TRIED_RUNS = { plugin: 'msgate-agents', key: 'triedRuns' }
const TRIED_CAP = 200
const CLAIM_ATTEMPTS = 3

// withinCap drops the oldest ids over the cap, passing over the ids of runs the
// engine still lists: forgetting one of those would try its run again. Past the
// cap with that many runs listed, the record is longer than the cap.
function withinCap(ids, listed) {
  let excess = ids.length - TRIED_CAP
  return ids.filter((id) => {
    if (excess <= 0 || listed.has(id)) return true
    excess--
    return false
  })
}

// claimNewRuns marks the listed runs not yet tried as tried and returns them. A
// write that lost to another write is redone against what that write left.
async function claimNewRuns($, runs) {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const { value = [], version } = await $.state.get(TRIED_RUNS)
    const fresh = runs.filter((run) => !value.includes(run.run_id))
    if (fresh.length === 0) return []
    const kept = withinCap(value.concat(fresh.map((run) => run.run_id)), new Set(runs.map((run) => run.run_id)))
    if ((await $.state.set(TRIED_RUNS, kept, { ifVersion: version })).isSet) return fresh
  }
  throw new Error('the record of tried runs kept changing')
}

async function openNewRows($) {
  for (const run of await claimNewRuns($, await $.msgate.flaggedRuns())) await openRow($, run)
}

// The timer that polls for new runs, and whether a poll is running.
let timer = null
let isPolling = false
let lastListFailure = null

// poll lists the flagged runs and opens their rows. A period that comes while
// the last poll is still running does nothing, so polls never overlap. A
// failed listing is logged when its reason changes, not on every period.
async function poll($) {
  if (isPolling) return
  isPolling = true
  try {
    await openNewRows($)
    lastListFailure = null
  } catch (error) {
    const reason = messageOf(error)
    if (reason !== lastListFailure) $.ui.log('msgate-agents: could not list the flagged runs: ' + reason, { to: 'debug' })
    lastListFailure = reason
  } finally {
    isPolling = false
  }
}

// stopRunRows ends the poll, for an engine that cannot serve the hidden type.
export function stopRunRows() {
  if (timer !== null) timer.cancel()
  timer = null
}

// startRunRows backs and registers the hidden type, and polls for flagged runs
// on a timer of the plugin's own, only when the engine can serve the type.
export async function startRunRows($, version) {
  stopRunRows()
  if (!(await openRunRows($, version))) return
  timer = $.clock.every(POLL_MS, () => {
    poll($)
  })
}
