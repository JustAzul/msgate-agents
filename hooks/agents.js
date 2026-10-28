// The six agent types this plugin registers and the profile each one is backed
// with. Nothing here touches the mods API, so it can be read and tested on its
// own.

// The first line every failed hand-off answers with, so an answer that did not
// come from the agent can never pass for one.
export const HANDOFF_FAILED = 'msgate: the hand-off to the agent failed, so this is not its answer.'

const REVIEW_TARGETS = "'uncommitted', 'base <branch>' or 'commit <sha>'"
const SHARED_NOTE =
  ' The prompt must stand on its own: the agent sees nothing of this session.' +
  ' Use only when the user asks for Codex, GPT or another agent; never choose it on your own.'

const MODEL = 'gpt-6.1-sol'

// description: what the model reads when it picks a type. profile: what the
// engine runs the type with; a setting left out is the provider's default.
const TYPES = {
  'second-opinion': {
    description: 'Codex judges a decision, plan or design already drafted. Read-only.',
    profile: { command: 'exec', promptMode: 'free', model: MODEL, effort: 'high', sandbox: 'read-only' },
  },
  'code-review': {
    description:
      'Codex runs its own review of a diff and returns findings with file and line. The prompt is the target and nothing else: ' +
      REVIEW_TARGETS + '. Read-only.',
    profile: { command: 'review', promptMode: 'review-target', model: MODEL, effort: 'high', sandbox: 'read-only' },
  },
  'cross-check': {
    description: 'Codex looks over finished code named by file path for what was missed. Read-only.',
    profile: { command: 'exec', promptMode: 'free', model: MODEL, effort: 'high', sandbox: 'read-only' },
  },
  'expert-persona': {
    description: 'Codex answers a judgment question as a senior practitioner of the field the prompt names. Read-only.',
    profile: { command: 'exec', promptMode: 'free', model: MODEL, effort: 'xhigh', sandbox: 'read-only' },
  },
  delegation: {
    description: 'Codex does well-scoped mechanical work and may write files in the working directory.',
    profile: { command: 'exec', promptMode: 'free', model: MODEL, effort: 'medium', sandbox: 'workspace-write' },
  },
  adhoc: {
    description: 'Codex answers anything else, with the provider defaults.',
    profile: { command: 'exec', promptMode: 'free', sandbox: 'read-only' },
  },
}

// What the real model reads if the engine ever fails to answer a request.
const FALLTHROUGH_PROMPT =
  'The msgate engine answers every request made to this agent. If you are reading this, the hand-off failed. ' +
  'Reply with exactly this line and nothing else, and call no tools: ' + HANDOFF_FAILED

export const DISPATCH_SKILL = 'dispatch'

export function agentTypeNames() {
  return Object.keys(TYPES)
}

// baseModelOf is the model a type is written for, or undefined when it runs on
// the provider's default.
export function baseModelOf(name) {
  return TYPES[name].profile.model
}

// The tool a stepped row ends each step with. The host refuses a call to a tool
// missing from the agent's list, so the list and the `stepped` declaration go
// together.
export const PROGRESS_TOOL = 'mcp__msgate__progress'

// The first engine minor that follows a run in steps, and the first that lists
// the provider's models.
const STEPS_ENGINE_MINOR = 4
const MODELS_ENGINE_MINOR = 4

function atLeastMinor(version, minor) {
  const [major, found] = String(version).split('.').map(Number)
  return major === 1 && found >= minor
}

// hasSteps tells whether an engine of this version runs a stepped row.
export function hasSteps(version) {
  return atLeastMinor(version, STEPS_ENGINE_MINOR)
}

// hasModels tells whether an engine of this version answers `models()`.
export function hasModels(version) {
  return atLeastMinor(version, MODELS_ENGINE_MINOR)
}

// A variant is `{ base, name, model, purpose }` (see models.js): a type that runs
// as its base does, on another model. It states the base as its purpose, never
// its own name, so the statistics and the time estimate stay with the base.
function describedWith(base, model) {
  return TYPES[base].description + ' Runs on the model ' + model + '.'
}

function specOf(name, description, version) {
  return {
    name,
    description: description + SHARED_NOTE,
    prompt: FALLTHROUGH_PROMPT,
    model: 'haiku',
    tools: hasSteps(version) ? ['Read', PROGRESS_TOOL] : ['Read'],
    omitClaudeMd: true,
    background: true,
  }
}

// agentSpecs is what the mod registers. The model and tool list matter only if
// the engine does not answer: the cheapest model and one read-only tool, and
// the progress tool when the engine runs steps.
export function agentSpecs(version) {
  return agentTypeNames().map((name) => specOf(name, TYPES[name].description, version))
}

export function variantSpecs(version, variants) {
  return variants.map((variant) => specOf(variant.name, describedWith(variant.base, variant.model), version))
}

function steppedFor(version) {
  return hasSteps(version) ? { stepped: true } : {}
}

// backArgs is the `backType` call that hands a type's profile to the engine.
export function backArgs(name, version) {
  return { type: name, ...TYPES[name].profile, ...steppedFor(version) }
}

export function variantBackArgs(variant, version) {
  return { type: variant.name, ...TYPES[variant.base].profile, model: variant.model, purpose: variant.base, ...steppedFor(version) }
}

// The hidden type that stands for a run in the agent list. It is offered to no
// model and is not one of the six: the engine answers its rows, so its
// definition is a placeholder that is never run.
export const RUN_TYPE = 'run'
export const RUN_PROFILE = { command: 'follow', promptMode: 'run-id' }

// The first engine minor that answers a `follow` row and lists flagged runs.
const RUN_ENGINE_MINOR = 1

// hasRunRows tells whether an engine of this version can serve the hidden type.
export function hasRunRows(version) {
  return atLeastMinor(version, RUN_ENGINE_MINOR)
}

export function runSpec(version) {
  return {
    name: RUN_TYPE,
    description: 'A row for a run in flight. Offered to no model.',
    prompt: 'This row is answered by the msgate engine. Reply with nothing.',
    model: 'haiku',
    tools: hasSteps(version) ? [PROGRESS_TOOL] : [],
    omitClaudeMd: true,
  }
}

export function runBackArgs(version) {
  return { type: RUN_TYPE, ...RUN_PROFILE, ...steppedFor(version) }
}

// isRunType tells whether a full type ("<plugin>:<name>") is this plugin's hidden one.
export function isRunType(pluginName, fullType) {
  return fullType === pluginName + ':' + RUN_TYPE
}

// typeOf returns the type name for a full type ("<plugin>:<name>") this plugin
// registered, or null. variantNames are the variants registered so far.
export function typeOf(pluginName, fullType, variantNames = []) {
  const prefix = pluginName + ':'
  if (typeof fullType !== 'string' || !fullType.startsWith(prefix)) return null
  const name = fullType.slice(prefix.length)
  return agentTypeNames().includes(name) || variantNames.includes(name) ? name : null
}
