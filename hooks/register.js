import { DISPATCH_SKILL, agentSpecs, agentTypeNames, backArgs, isRunType, typeOf } from './agents.js'
import { startRunRows, stopRunRows } from './rows.js'

// Set once the dispatch skill has loaded in this session; the agent types are
// offered to the model only then. Session state is never shared with another
// session, so no session can close another's gate.
const DISPATCH_LOADED = { plugin: 'msgate-agents', key: 'dispatchLoaded' }
// The types the engine backed at this session's start: only these are offered.
const BACKED_TYPES = { plugin: 'msgate-agents', key: 'backedTypes' }
// Set once the session was told the engine is missing, so a reload says nothing more.
const ENGINE_NOTICE = { plugin: 'msgate-agents', key: 'engineNoticeShown' }

const ENGINE_MAJOR = 1
const NEEDS_ENGINE = 'msgate-agents needs the msgate engine plugin ' + ENGINE_MAJOR + '.x'

function messageOf(error) {
  return String(error && error.message ? error.message : error)
}

// engineVersion asks the engine for its version: the version found, or why the
// engine cannot be used. Rejections and a missing interface are the same case.
async function engineVersion($) {
  try {
    const version = await $.msgate.version()
    const isUsable = typeof version === 'string' && Number(version.split('.')[0]) === ENGINE_MAJOR
    return isUsable ? { version } : { version: typeof version === 'string' ? version : null, problem: 'the engine is version ' + String(version) }
  } catch (error) {
    return { version: null, problem: messageOf(error) }
  }
}

async function noteMissingEngine($, found) {
  if ((await $.state.get(ENGINE_NOTICE)).value === true) return
  await $.state.set(ENGINE_NOTICE, true)
  await $.ui.toast(found.version === null ? NEEDS_ENGINE : NEEDS_ENGINE + ' (found ' + found.version + ')')
  $.ui.log('msgate-agents: the msgate engine cannot be used, so no agent type is offered: ' + found.problem, { to: 'debug' })
}

// backTypes hands each type's profile to the engine and returns the names it
// backed; a refusal hides only that type.
async function backTypes($) {
  const backed = []
  for (const name of agentTypeNames()) {
    try {
      await $.msgate.backType(backArgs(name))
      backed.push(name)
    } catch (error) {
      $.ui.log('msgate-agents: the engine refused to back agent type ' + name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
  return backed
}

async function registerAgentTypes($) {
  for (const spec of agentSpecs()) {
    try {
      await $.agent.register(spec)
    } catch (error) {
      // One type that fails to register must not keep the others from it.
      $.ui.log('msgate-agents: could not register agent type ' + spec.name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
}

async function isOffered($, type) {
  if ((await $.state.get(DISPATCH_LOADED)).value !== true) return false
  const backed = (await $.state.get(BACKED_TYPES)).value
  return Array.isArray(backed) && backed.includes(type)
}

function isOurs(pluginName, agent) {
  return isRunType(pluginName, agent) || typeOf(pluginName, agent) !== null
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await registerAgentTypes($)
    const found = await engineVersion($)
    if (found.problem === undefined) {
      await $.state.set(BACKED_TYPES, await backTypes($))
      await startRunRows($, found.version)
    } else {
      await $.state.set(BACKED_TYPES, [])
      stopRunRows()
      await noteMissingEngine($, found)
    }
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    if (e.skill === $.plugin.name + ':' + DISPATCH_SKILL) await $.state.set(DISPATCH_LOADED, true)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    if (isRunType($.plugin.name, e.agent)) return { isOffered: false }
    const type = typeOf($.plugin.name, e.agent)
    if (type === null) return next(e)
    return (await isOffered($, type)) ? next(e) : { isOffered: false }
  }).catch(($, e, next) => (next.called || !isOurs($.plugin.name, e.agent) ? next(e) : { isOffered: false }))
}
