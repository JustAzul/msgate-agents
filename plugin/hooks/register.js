import { DISPATCH_SKILL, agentSpecs, agentTypeNames, backArgs, hasModels, isRunType, typeOf, variantBackArgs, variantSpecs } from './agents.js'
import { modelVariants } from './models.js'
import { startRunRows, stopRunRows } from './rows.js'

// Set once the dispatch skill has loaded in this session; the agent types are
// offered to the model only then. Session state is never shared with another
// session, so no session can close another's gate.
const DISPATCH_LOADED = { plugin: 'msgate-agents', key: 'dispatchLoaded' }
// The types the engine backed at this session's start: only these are offered.
const BACKED_TYPES = { plugin: 'msgate-agents', key: 'backedTypes' }
// The names of the variants registered so far in this session. Only ever grows:
// the host keeps a registered type for the session, so a reload that finds no
// catalog must still know them to keep them hidden.
const VARIANTS = { plugin: 'msgate-agents', key: 'variants' }
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
async function backTypes($, version) {
  const backed = []
  for (const name of agentTypeNames()) {
    try {
      await $.msgate.backType(backArgs(name, version))
      backed.push(name)
    } catch (error) {
      $.ui.log('msgate-agents: the engine refused to back agent type ' + name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
  return backed
}

async function registerAgentTypes($, version) {
  for (const spec of agentSpecs(version)) {
    try {
      await $.agent.register(spec)
    } catch (error) {
      // One type that fails to register must not keep the others from it.
      $.ui.log('msgate-agents: could not register agent type ' + spec.name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
}

// catalogVariants asks the engine for the provider's models and returns the
// variants they call for. Any failure, an engine with no `models` among them,
// leaves the session with the types it has.
async function catalogVariants($) {
  try {
    // `$.msgate.models` appears only as a call: the host's loader rejects it
    // used as a value (a `typeof` test) and drops the whole module. A missing
    // function is a TypeError and takes the same path as any catalog failure.
    return modelVariants(await $.msgate.models())
  } catch (error) {
    $.ui.log('msgate-agents: no model variants this session: ' + messageOf(error), { to: 'debug' })
    return []
  }
}

async function registerVariants($, version, variants) {
  const registered = []
  for (const [index, spec] of variantSpecs(version, variants).entries()) {
    try {
      await $.agent.register(spec)
      registered.push(variants[index])
    } catch (error) {
      $.ui.log('msgate-agents: could not register agent type ' + spec.name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
  // A record that is not a list is written over.
  const known = await variantNames($).catch(() => [])
  await $.state.set(VARIANTS, [...new Set([...known, ...registered.map((variant) => variant.name)])])
  return registered
}

// addVariants registers the variants the catalog calls for and backs them with
// the engine, once the types of the session are in place. It returns the names
// the engine backed.
async function addVariants($, version) {
  if (!hasModels(version)) return []
  const registered = await registerVariants($, version, await catalogVariants($))
  const backed = []
  for (const variant of registered) {
    try {
      await $.msgate.backType(variantBackArgs(variant, version))
      backed.push(variant.name)
    } catch (error) {
      $.ui.log('msgate-agents: the engine refused to back agent type ' + variant.name + ': ' + messageOf(error), { to: 'debug' })
    }
  }
  return backed
}

async function isOffered($, type) {
  if ((await $.state.get(DISPATCH_LOADED)).value !== true) return false
  const backed = (await $.state.get(BACKED_TYPES)).value
  return Array.isArray(backed) && backed.includes(type)
}

async function variantNames($) {
  const { value } = await $.state.get(VARIANTS)
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new TypeError('the record of variants is not a list')
  return value
}

// isOurs tells whether an agent is one of this plugin's. When the variants
// cannot be read or are not a list, every agent named for the plugin counts as its own, so none
// reaches the model without its gate.
async function isOurs($, agent) {
  try {
    return isRunType($.plugin.name, agent) || typeOf($.plugin.name, agent, await variantNames($)) !== null
  } catch {
    return agent.startsWith($.plugin.name + ':')
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const found = await engineVersion($)
    await registerAgentTypes($, found.version)
    if (found.problem === undefined) {
      const backed = await backTypes($, found.version)
      await $.state.set(BACKED_TYPES, backed)
      await startRunRows($, found.version)
      const backedVariants = await addVariants($, found.version)
      if (backedVariants.length > 0) await $.state.set(BACKED_TYPES, [...backed, ...backedVariants])
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
    const type = typeOf($.plugin.name, e.agent, await variantNames($))
    if (type === null) return next(e)
    return (await isOffered($, type)) ? next(e) : { isOffered: false }
  }).catch(async ($, e, next) => (next.called || !(await isOurs($, e.agent)) ? next(e) : { isOffered: false }))
}
