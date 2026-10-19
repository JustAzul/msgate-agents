// Shared stubs for the mod tests: a fake world beneath the mod where the
// msgate engine interface, the agent registry and the display calls are all in
// memory.
import { mock } from 'claude-code/testing'

export type BackCall = { type: string; command: string; promptMode: string; model?: string; effort?: string; sandbox?: string; purpose?: string; stepped?: boolean }

// How the fake engine behaves: present with a version, absent altogether, or
// refusing the `backType` of the listed types. `hasModels: false` leaves the
// `models` function out of the interface, as an engine before 1.4 does.
export type Engine = { kind: 'absent' } | { kind: 'present'; version: string | (() => Promise<string>); refuse?: string[]; hasModels?: boolean }

export const present = (version = '1.0.0', refuse: string[] = [], hasModels = true): Engine => ({ kind: 'present', version, refuse, hasModels })
export const absent: Engine = { kind: 'absent' }

export type FlaggedRun = { run_id: string; purpose: string; source: string; started_at: string }
export type Catalog = { provider: string; models: { id: string; name: string; visibility: string }[] }
export type SpawnArgs = { subagentType: string; prompt: string; description: string }

export const RUN_TYPE = 'msgate-agents:run'
export const TYPES = ['adhoc', 'code-review', 'cross-check', 'delegation', 'expert-persona', 'second-opinion']
export const START = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
export const HANDOFF_FAILED = 'msgate: the hand-off to the agent failed, so this is not its answer.'

// world registers every stub a test needs. Call it before the first call on $.
export function world(on: any, engine: Engine = present()) {
  const w = {
    clock: mock.clock(on),
    toasts: [] as string[],
    debugLogs: [] as string[],
    agentTypes: [] as any[],
    backCalls: [] as BackCall[],
    versionCalls: 0,
    skillTexts: [] as string[],
    // What the engine answers to `models()`; a test sets it.
    modelsCalls: 0,
    catalog: (async () => ({ provider: 'codex', models: [] })) as () => Promise<Catalog | unknown>,
    // A state key whose value reads back as something no one wrote, while a test sets it.
    corruptKey: null as string | null,
    // The runs the engine reports as flagged, and what each spawn answers; a test sets them.
    flaggedCalls: 0,
    flaggedRuns: (async () => []) as () => Promise<FlaggedRun[]>,
    // The session's record of the runs tried, which outlives a load of the plugin: a test seeds it to model a reload.
    tried: { value: undefined as string[] | undefined, version: 0 },
    // Another write to the record that lands just before the plugin's next one.
    rivalTriedWrite: null as string[] | null,
    spawns: [] as SpawnArgs[],
    spawnAnswer: ((_args: SpawnArgs) => ({ model: 'haiku', agentId: 'row' })) as (args: SpawnArgs) => any,
  }
  on('session.start', () => ({ cwd: '/work' }))
  if (engine.kind === 'present') {
    on('engine.create', async (_$: any, e: any, next: any) => ({
      ...(await next(e)),
      msgate: {
        version: async () => {
          w.versionCalls += 1
          return typeof engine.version === 'function' ? engine.version() : engine.version
        },
        flaggedRuns: async () => {
          w.flaggedCalls += 1
          return w.flaggedRuns()
        },
        ...(engine.hasModels === false
          ? {}
          : {
              models: async () => {
                w.modelsCalls += 1
                return w.catalog()
              },
            }),
        backType: async (args: BackCall) => {
          w.backCalls.push(args)
          if (engine.refuse?.includes(args.type)) throw new Error('msgate:backType:model')
          return { type: 'msgate-agents:' + args.type }
        },
      },
    }))
  }
  on('ui.toast', (_$: any, e: any) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_$: any, e: any) => {
    if (e.to === 'debug') w.debugLogs.push(e.text)
    return { value: undefined }
  })
  on('agent.register', (_$: any, e: any) => {
    w.agentTypes.push(e)
    return { value: { agent: 'msgate-agents:' + e.name } }
  })
  on('state.get', (_$: any, e: any, next: any) => {
    if (e.key === w.corruptKey) return { value: { value: 42, version: 1 } }
    return e.key === 'triedRuns' ? { value: { value: w.tried.value, version: w.tried.version } } : next(e)
  })
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.key !== 'triedRuns') return next(e)
    if (w.rivalTriedWrite !== null) {
      w.tried = { value: w.rivalTriedWrite, version: w.tried.version + 1 }
      w.rivalTriedWrite = null
    }
    if (e.ifVersion !== undefined && e.ifVersion !== w.tried.version) return { value: { isSet: false, version: w.tried.version } }
    w.tried = { value: e.value, version: w.tried.version + 1 }
    return { value: { isSet: true, version: w.tried.version } }
  })
  on('agent.spawn', (_$: any, e: any) => {
    // The kit's bottom sees the call as the Agent tool takes it.
    w.spawns.push({ subagentType: e.subagent_type, prompt: e.prompt, description: e.description })
    return w.spawnAnswer(w.spawns[w.spawns.length - 1])
  })
  on('agent.offer', () => ({ isOffered: true }))
  on('skill.prompt', (_$: any, e: any) => ({ text: e.text }))
  return w
}
