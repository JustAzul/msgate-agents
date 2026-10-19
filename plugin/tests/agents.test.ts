import { expect, test } from 'claude-code/testing'
import { HANDOFF_FAILED, RUN_TYPE, START, TYPES, absent, present, world } from './kit'

test('session start registers the six agent types and backs each with its profile', async ($, on) => {
  const w = world(on)
  await $.session.start(START)

  expect(w.agentTypes.map((t) => t.name).sort()).toEqual([...TYPES].sort())
  for (const spec of w.agentTypes) {
    expect(spec.background).toBe(true)
    expect(spec.description).toContain('Use only when the user asks')
    expect(spec.model).toBe('haiku')
    expect(spec.tools).toEqual(['Read'])
    expect(spec.omitClaudeMd).toBe(true)
    expect(spec.prompt).toContain(HANDOFF_FAILED)
  }

  const byType = Object.fromEntries(w.backCalls.map((c) => [c.type, c]))
  expect(w.backCalls).toHaveLength(6)
  expect(byType['second-opinion']).toEqual({ type: 'second-opinion', command: 'exec', promptMode: 'free', model: 'gpt-6.1-sol', effort: 'high', sandbox: 'read-only' })
  expect(byType['code-review']).toEqual({ type: 'code-review', command: 'review', promptMode: 'review-target', model: 'gpt-6.1-sol', effort: 'high', sandbox: 'read-only' })
  expect(byType['cross-check']).toEqual({ type: 'cross-check', command: 'exec', promptMode: 'free', model: 'gpt-6.1-sol', effort: 'high', sandbox: 'read-only' })
  expect(byType['expert-persona']).toEqual({ type: 'expert-persona', command: 'exec', promptMode: 'free', model: 'gpt-6.1-sol', effort: 'xhigh', sandbox: 'read-only' })
  expect(byType['delegation']).toEqual({ type: 'delegation', command: 'exec', promptMode: 'free', model: 'gpt-6.1-sol', effort: 'medium', sandbox: 'workspace-write' })
  // adhoc leaves model and effort to the provider's defaults.
  expect(byType['adhoc']).toEqual({ type: 'adhoc', command: 'exec', promptMode: 'free', sandbox: 'read-only' })
})

const offer = ($: any, agent: string) => $.agent.offer({ agent, description: '', source: 'plugin', provider: { plugin: 'msgate-agents', tier: 'user' } } as any)

test('the agent types are hidden from the model until the dispatch skill loads in the session', async ($, on) => {
  world(on)
  await $.session.start(START)

  expect(await offer($, 'msgate-agents:delegation')).toEqual({ isOffered: false })
  // Agents of other plugins and the built-in ones are never this plugin's to hide.
  expect(await offer($, 'Explore')).toEqual({ isOffered: true })

  await $.skill.prompt({ skill: 'msgate-agents:other', text: '' })
  expect(await offer($, 'msgate-agents:delegation')).toEqual({ isOffered: false })

  await $.skill.prompt({ skill: 'msgate-agents:dispatch', text: 'Dispatch' })
  for (const name of TYPES) expect(await offer($, 'msgate-agents:' + name)).toEqual({ isOffered: true })
})

const loadDispatch = ($: any) => $.skill.prompt({ skill: 'msgate-agents:dispatch', text: 'Dispatch' })
const NEEDS = 'msgate-agents needs the msgate engine plugin 1.x'

test('with no engine installed the session shows one toast and one log line and offers no type', async ($, on) => {
  const w = world(on, absent)
  await $.session.start(START)
  await loadDispatch($)

  expect(w.toasts).toEqual([NEEDS])
  expect(w.debugLogs.filter((line) => line.includes('msgate engine'))).toHaveLength(1)
  expect(w.backCalls).toEqual([])
  for (const name of TYPES) expect(await offer($, 'msgate-agents:' + name)).toEqual({ isOffered: false })
})

test('an engine of another major shows one toast naming 1.x and the version found, backs nothing and hides every type', async ($, on) => {
  const w = world(on, present('2.0.0'))
  await $.session.start(START)
  await loadDispatch($)

  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain(NEEDS)
  expect(w.toasts[0]).toContain('2.0.0')
  expect(w.backCalls).toEqual([])
  for (const name of TYPES) expect(await offer($, 'msgate-agents:' + name)).toEqual({ isOffered: false })
})

test('an engine whose version call is refused is treated as missing', async ($, on) => {
  const w = world(on, present(async () => {
    throw new Error('msgate:version:unserved')
  }))
  await $.session.start(START)
  await loadDispatch($)

  expect(w.toasts).toEqual([NEEDS])
  expect(w.backCalls).toEqual([])
  expect(await offer($, 'msgate-agents:adhoc')).toEqual({ isOffered: false })
})

test('a reload of a session that already heard the engine is missing shows no second toast', async ($, on) => {
  const w = world(on, absent)
  await $.session.start(START)
  await $.session.start(START)

  expect(w.toasts).toEqual([NEEDS])
})

test('when the engine refuses one type that type is hidden and logged, and the other five are offered', async ($, on) => {
  const w = world(on, present('1.4.2', ['delegation']))
  await $.session.start(START)
  await loadDispatch($)

  expect(await offer($, 'msgate-agents:delegation')).toEqual({ isOffered: false })
  for (const name of TYPES.filter((type) => type !== 'delegation')) expect(await offer($, 'msgate-agents:' + name)).toEqual({ isOffered: true })
  expect(w.debugLogs.filter((line) => line.includes('delegation') && line.includes('msgate:backType:model'))).toHaveLength(1)
  expect(w.toasts).toEqual([])
})

test('every session start backs the six types again, and the dispatch gate survives the reload', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  await loadDispatch($)
  await $.session.start(START)

  expect(w.backCalls).toHaveLength(12)
  expect(w.backCalls.slice(6).map((call) => call.type).sort()).toEqual([...TYPES].sort())
  expect(await offer($, 'msgate-agents:adhoc')).toEqual({ isOffered: true })
})

const runRegistered = (w: any) => w.agentTypes.filter((t: any) => t.name === 'run')
const runBacked = (w: any) => w.backCalls.filter((c: any) => c.type === 'run')

test('an engine from 1.1 on gets the hidden run type, registered with no tools and backed to follow a run id', async ($, on) => {
  const w = world(on, present('1.1.0'))
  await $.session.start(START)

  expect(runRegistered(w)).toHaveLength(1)
  expect(runRegistered(w)[0].tools).toEqual([])
  expect(runBacked(w)).toEqual([{ type: 'run', command: 'follow', promptMode: 'run-id' }])
  // The six dispatchable types are untouched by it.
  expect(w.backCalls.filter((c: any) => c.type !== 'run')).toHaveLength(6)
})

test('a later minor or patch of 1.x keeps the hidden run type', async ($, on) => {
  const w = world(on, present('1.12.3'))
  await $.session.start(START)

  expect(runRegistered(w)).toHaveLength(1)
  expect(runBacked(w)).toHaveLength(1)
})

test('an engine at 1.0.x gets no hidden run type and no timer, and the six types stay as they were', async ($, on) => {
  const w = world(on, present('1.0.9'))
  w.flaggedRuns = async () => [{ run_id: 'r1', purpose: 'second-opinion', source: 'cli', started_at: '' }]
  await $.session.start(START)
  await w.clock.advance(20000)

  expect(runRegistered(w)).toEqual([])
  expect(runBacked(w)).toEqual([])
  expect(w.backCalls).toHaveLength(6)
  expect(w.flaggedCalls).toBe(0)
  expect(w.spawns).toEqual([])
})

test('the hidden run type is offered to no model, with the dispatch skill loaded or not', async ($, on) => {
  world(on, present('1.1.0'))
  await $.session.start(START)

  expect(await offer($, RUN_TYPE)).toEqual({ isOffered: false })
  await loadDispatch($)
  expect(await offer($, RUN_TYPE)).toEqual({ isOffered: false })
  // The dispatchable types it sits beside are still offered.
  expect(await offer($, 'msgate-agents:adhoc')).toEqual({ isOffered: true })
})

test('the hidden run type stays refused when the engine is missing or too old', async ($, on) => {
  world(on, absent)
  await $.session.start(START)
  await loadDispatch($)

  expect(await offer($, RUN_TYPE)).toEqual({ isOffered: false })
})

const RUN_A = { run_id: 'run-a', purpose: 'second-opinion', source: 'cli', started_at: '2026-10-16T10:00:00Z' }
const RUN_B = { run_id: 'run-b', purpose: 'code-review', source: 'mcp', started_at: '2026-10-16T10:00:01Z' }
const TICK = 5000

test('every 5 seconds the plugin opens one hidden run row per flagged run, with the run id as prompt and purpose and source as description', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A, RUN_B]
  await $.session.start(START)

  await w.clock.advance(TICK - 1)
  expect(w.spawns).toEqual([])
  await w.clock.advance(1)
  expect(w.spawns).toEqual([
    { subagentType: RUN_TYPE, prompt: 'msgate run run-a', description: 'second-opinion · cli' },
    { subagentType: RUN_TYPE, prompt: 'msgate run run-b', description: 'code-review · mcp' },
  ])
})

test('a run that already has a row is not opened again, while a run that shows up later is', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A]
  await $.session.start(START)
  await w.clock.advance(TICK * 3)
  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-a'])

  w.flaggedRuns = async () => [RUN_A, RUN_B]
  await w.clock.advance(TICK)
  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-a', 'msgate run run-b'])
})

const logsAbout = (w: any, runId: string) => w.debugLogs.filter((line: string) => line.includes(runId))

test('a refused spawn writes one log line for its run, is not tried again, and keeps the other runs from being opened', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A, RUN_B]
  w.spawnAnswer = (args) => (args.prompt.endsWith('run-a') ? { deny: 'msgate: a hidden row does not open in the auto permission mode' } : { model: 'haiku', agentId: 'row-b' })
  await $.session.start(START)
  await w.clock.advance(TICK * 3)

  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-a', 'msgate run run-b'])
  expect(logsAbout(w, 'run-a')).toHaveLength(1)
  expect(logsAbout(w, 'run-a')[0]).toContain('auto permission mode')
  expect(logsAbout(w, 'run-b')).toEqual([])
})

test('a spawn that throws writes one log line for its run and is not tried again', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A, RUN_B]
  w.spawnAnswer = (args) => {
    if (args.prompt.endsWith('run-a')) throw new Error('spawn exploded')
    return { model: 'haiku', agentId: 'row-b' }
  }
  await $.session.start(START)
  await w.clock.advance(TICK * 3)

  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-a', 'msgate run run-b'])
  expect(logsAbout(w, 'run-a')).toHaveLength(1)
  expect(logsAbout(w, 'run-b')).toEqual([])
})

test('a poll that is still running when the next period comes is not joined by another', async ($, on) => {
  const w = world(on, present('1.1.0'))
  let release: () => void = () => {}
  w.flaggedRuns = () => new Promise((resolve) => {
    release = () => resolve([RUN_A])
  })
  await $.session.start(START)

  await w.clock.advance(TICK * 3)
  expect(w.flaggedCalls).toBe(1)

  release()
  await w.clock.settle()
  expect(w.spawns).toHaveLength(1)
  await w.clock.advance(TICK)
  expect(w.flaggedCalls).toBe(2)
})

test('a failed listing is logged once while it keeps failing, and the next period asks again', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => {
    throw new Error('msgate:flaggedRuns:failed')
  }
  await $.session.start(START)
  await w.clock.advance(TICK * 3)

  expect(w.flaggedCalls).toBe(3)
  expect(w.debugLogs.filter((line) => line.includes('msgate:flaggedRuns:failed'))).toHaveLength(1)

  w.flaggedRuns = async () => [RUN_A]
  await w.clock.advance(TICK)
  expect(w.spawns).toHaveLength(1)
})

test('when the engine refuses to back the run type there is no timer', async ($, on) => {
  const w = world(on, present('1.1.0', ['run']))
  await $.session.start(START)
  await w.clock.advance(TICK * 3)

  expect(w.flaggedCalls).toBe(0)
  expect(runRegistered(w)).toEqual([])
  expect(w.debugLogs.filter((line) => line.includes('run') && line.includes('msgate:backType:model'))).toHaveLength(1)
})

test('a second session start leaves a single timer', async ($, on) => {
  const w = world(on, present('1.1.0'))
  await $.session.start(START)
  await $.session.start(START)
  await w.clock.advance(TICK)

  expect(w.flaggedCalls).toBe(1)
})

test('an engine that falls back to 1.0.x on reload leaves no timer', async ($, on) => {
  let version = '1.1.0'
  const w = world(on, present(async () => version))
  await $.session.start(START)
  version = '1.0.0'
  await $.session.start(START)
  await w.clock.advance(TICK)

  expect(w.flaggedCalls).toBe(0)
})

test('a reload that finds the engine gone leaves no timer', async ($, on) => {
  let isUp = true
  const w = world(on, present(async () => {
    if (!isUp) throw new Error('msgate:version:unserved')
    return '1.1.0'
  }))
  await $.session.start(START)
  isUp = false
  await $.session.start(START)
  await w.clock.advance(TICK)

  expect(w.flaggedCalls).toBe(0)
})

test('a run the plugin tried before a reload is not spawned or logged again', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A, RUN_B]
  // The session remembers what an earlier load of the plugin tried; the new load starts with nothing in memory.
  w.tried = { value: ['run-a'], version: 1 }
  await $.session.start(START)
  await w.clock.advance(TICK * 2)

  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-b'])
  expect(logsAbout(w, 'run-a')).toEqual([])
})

test('a refused run is kept in the session state so it is not tried again after a reload', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A]
  w.spawnAnswer = () => ({ deny: 'msgate: a hidden row does not open in the auto permission mode' })
  await $.session.start(START)
  await w.clock.advance(TICK)

  expect(w.tried.value).toEqual(['run-a'])
})

test('more listed refused runs than the cap are never tried again, however many polls pass', async ($, on) => {
  const w = world(on, present('1.1.0'))
  const runs = Array.from({ length: 205 }, (_, i) => ({ ...RUN_A, run_id: 'run-' + i }))
  w.flaggedRuns = async () => runs
  w.spawnAnswer = () => ({ deny: 'msgate: a hidden row does not open in the auto permission mode' })
  await $.session.start(START)
  await w.clock.advance(TICK * 4)

  expect(w.spawns).toHaveLength(205)
  expect(w.debugLogs.filter((line) => line.includes('no row opened'))).toHaveLength(205)
})

test('past the cap the record drops the oldest runs that are no longer listed, and keeps the 200 newest', async ($, on) => {
  const w = world(on, present('1.1.0'))
  const run = (i: number) => ({ ...RUN_A, run_id: 'run-' + i })
  w.flaggedRuns = async () => Array.from({ length: 205 }, (_, i) => run(i))
  await $.session.start(START)
  await w.clock.advance(TICK)

  w.flaggedRuns = async () => [run(204), run(205)]
  await w.clock.advance(TICK)

  const kept = w.tried.value as string[]
  expect(kept).toHaveLength(200)
  expect(kept[0]).toBe('run-6')
  expect(kept[199]).toBe('run-205')
  expect(w.spawns.map((s) => s.prompt).slice(205)).toEqual(['msgate run run-205'])
})

test('a write to the record of tried runs that loses to another write is redone against what that write left', async ($, on) => {
  const w = world(on, present('1.1.0'))
  w.flaggedRuns = async () => [RUN_A, RUN_B]
  w.rivalTriedWrite = ['run-b']
  await $.session.start(START)
  await w.clock.advance(TICK)

  expect(w.spawns.map((s) => s.prompt)).toEqual(['msgate run run-a'])
  expect(w.tried.value).toEqual(['run-b', 'run-a'])
})

const PROGRESS = 'mcp__msgate__progress'

for (const version of ['1.4.0', '1.9.2']) {
  test('an engine at ' + version + ' gets the progress tool in every type and a stepped declaration, the hidden run type included', async ($, on) => {
    const w = world(on, present(version))
    await $.session.start(START)

    const answered = w.agentTypes.filter((t) => t.name !== 'run')
    expect(answered).toHaveLength(6)
    for (const spec of answered) expect(spec.tools).toEqual(['Read', PROGRESS])
    expect(runRegistered(w)[0].tools).toEqual([PROGRESS])
    expect(w.backCalls).toHaveLength(7)
    for (const call of w.backCalls) expect(call.stepped).toBe(true)
    expect(runBacked(w)).toEqual([{ type: 'run', command: 'follow', promptMode: 'run-id', stepped: true }])
  })
}

test('an engine of 1.3 declares no steps and lists no progress tool', async ($, on) => {
  const w = world(on, present('1.3.9'))
  await $.session.start(START)

  for (const spec of w.agentTypes.filter((t) => t.name !== 'run')) expect(spec.tools).toEqual(['Read'])
  expect(runRegistered(w)[0].tools).toEqual([])
  for (const call of w.backCalls) expect('stepped' in call).toBe(false)
})

const CATALOG = {
  provider: 'codex',
  models: [
    ...['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'].map((id) => ({ id, name: id, visibility: 'list' })),
    { id: 'gpt-reserve', name: 'r', visibility: 'hide' },
    { id: 'codex-auto-review', name: 'c', visibility: 'hide' },
    { id: 'gpt-6-hidden', name: 'h', visibility: 'hide' },
  ],
}
const VARIANTS = ['adhoc-gpt-6-1-sol', 'adhoc-gpt-6-astra', 'adhoc-gpt-6-luna', 'second-opinion-gpt-6-astra']
const variantsOf = (names: string[]) => names.filter((name) => !TYPES.includes(name) && name !== 'run').sort()

test('the engine catalog adds a variant of second-opinion and adhoc per model, each registered and backed with its base profile and its model', async ($, on) => {
  const w = world(on, present('1.4.0'))
  w.catalog = async () => CATALOG
  await $.session.start(START)

  expect(variantsOf(w.agentTypes.map((t) => t.name))).toEqual(VARIANTS)
  expect(variantsOf(w.backCalls.map((c) => c.type))).toEqual(VARIANTS)
  const byType = Object.fromEntries(w.backCalls.map((c) => [c.type, c]))
  expect(byType['second-opinion-gpt-6-astra']).toEqual({
    type: 'second-opinion-gpt-6-astra', command: 'exec', promptMode: 'free', model: 'gpt-6-astra', effort: 'high', sandbox: 'read-only', purpose: 'second-opinion', stepped: true,
  })
  expect(byType['adhoc-gpt-6-1-sol']).toEqual({
    type: 'adhoc-gpt-6-1-sol', command: 'exec', promptMode: 'free', model: 'gpt-6.1-sol', sandbox: 'read-only', purpose: 'adhoc', stepped: true,
  })
  const spec = w.agentTypes.find((t) => t.name === 'second-opinion-gpt-6-astra')
  expect(spec.description).toContain('Codex judges a decision, plan or design already drafted.')
  expect(spec.description).toContain('gpt-6-astra')
  expect(spec.description).toContain('Use only when the user asks')
  expect(spec.tools).toEqual(['Read', PROGRESS])
  expect(spec.background).toBe(true)
  expect(spec.model).toBe('haiku')
  expect(spec.prompt).toContain(HANDOFF_FAILED)
})

const SIX_AND_RUN = 7
const variantLogs = (w: any) => w.debugLogs.filter((line: string) => line.includes('model variants'))

const BAD_CATALOGS: Record<string, () => Promise<unknown>> = {
  'refused': async () => {
    throw new Error('msgate:models:failed')
  },
  'of a wrong shape': async () => ({ models: 'gpt-6-astra' }),
  'empty': async () => undefined,
}

for (const [label, answer] of Object.entries(BAD_CATALOGS)) {
  test('a catalog ' + label + ' leaves the six types and the run type, one debug line and no toast', async ($, on) => {
    const w = world(on, present('1.4.0'))
    w.catalog = answer
    await $.session.start(START)

    expect(w.backCalls).toHaveLength(SIX_AND_RUN)
    expect(variantsOf(w.agentTypes.map((t) => t.name))).toEqual([])
    expect(variantLogs(w)).toHaveLength(1)
    expect(w.toasts).toEqual([])
  })
}

test('an engine at 1.4 whose interface has no models function leaves the six types, one debug line and no toast', async ($, on) => {
  const w = world(on, present('1.4.0', [], false))
  await $.session.start(START)

  expect(w.backCalls).toHaveLength(SIX_AND_RUN)
  expect(variantLogs(w)).toHaveLength(1)
  expect(w.toasts).toEqual([])
})

for (const version of ['1.3.9', '2.0.0']) {
  test('an engine at ' + version + ' is not asked for a catalog and gets no variant', async ($, on) => {
    const w = world(on, present(version))
    w.catalog = async () => CATALOG
    await $.session.start(START)

    expect(w.modelsCalls).toBe(0)
    expect(variantsOf(w.agentTypes.map((t) => t.name))).toEqual([])
    expect(variantLogs(w)).toEqual([])
  })
}

test('the engine version is read before any type is registered, and the catalog only after the six types and the run type are backed', async ($, on) => {
  let registeredAtVersion = -1
  let backedAtCatalog = -1
  let registeredAtCatalog = -1
  const w: any = world(on, present(async () => {
    registeredAtVersion = w.agentTypes.length
    return '1.4.0'
  }))
  w.catalog = async () => {
    backedAtCatalog = w.backCalls.length
    registeredAtCatalog = w.agentTypes.length
    return CATALOG
  }
  await $.session.start(START)

  expect(registeredAtVersion).toBe(0)
  expect(backedAtCatalog).toBe(SIX_AND_RUN)
  expect(registeredAtCatalog).toBe(SIX_AND_RUN)
})

test('a variant is offered only after the dispatch skill loads, and an unknown agent of the plugin follows next', async ($, on) => {
  const w = world(on, present('1.4.0'))
  w.catalog = async () => CATALOG
  await $.session.start(START)

  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: false })
  await loadDispatch($)
  for (const name of VARIANTS) expect(await offer($, 'msgate-agents:' + name)).toEqual({ isOffered: true })
  expect(await offer($, 'msgate-agents:adhoc-gpt-9-nothing')).toEqual({ isOffered: true })
})

test('a variant the engine refuses to back is logged and never offered, and the other types are offered', async ($, on) => {
  const w = world(on, present('1.4.0', ['adhoc-gpt-6-astra']))
  w.catalog = async () => CATALOG
  await $.session.start(START)
  await loadDispatch($)

  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: false })
  expect(await offer($, 'msgate-agents:adhoc-gpt-6-luna')).toEqual({ isOffered: true })
  expect(await offer($, 'msgate-agents:adhoc')).toEqual({ isOffered: true })
  expect(w.debugLogs.filter((line) => line.includes('adhoc-gpt-6-astra') && line.includes('msgate:backType:model'))).toHaveLength(1)
})

test('every session start asks for the catalog again, and variants registered earlier stay hidden when the catalog is gone', async ($, on) => {
  const w = world(on, present('1.4.0'))
  w.catalog = async () => CATALOG
  await $.session.start(START)
  await loadDispatch($)
  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: true })

  w.catalog = async () => {
    throw new Error('msgate:models:failed')
  }
  await $.session.start(START)

  expect(w.modelsCalls).toBe(2)
  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: false })
  expect(await offer($, 'msgate-agents:adhoc')).toEqual({ isOffered: true })
})

test('a variant the engine backed keeps being recognized after a reload that finds a different catalog', async ($, on) => {
  const w = world(on, present('1.4.0'))
  w.catalog = async () => CATALOG
  await $.session.start(START)
  await loadDispatch($)
  w.catalog = async () => ({ provider: 'codex', models: [{ id: 'gpt-6-astra', name: 'a', visibility: 'list' }] })
  await $.session.start(START)

  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: true })
  expect(await offer($, 'msgate-agents:adhoc-gpt-6-luna')).toEqual({ isOffered: false })
})

test('when the record of variants is not a list, an agent of the plugin is hidden and an agent of another is not', async ($, on) => {
  const w = world(on, present('1.4.0'))
  w.catalog = async () => CATALOG
  await $.session.start(START)
  await loadDispatch($)
  w.corruptKey = 'variants'

  expect(await offer($, 'msgate-agents:adhoc-gpt-6-astra')).toEqual({ isOffered: false })
  expect(await offer($, 'Explore')).toEqual({ isOffered: true })
})
