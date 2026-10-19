// The msgate-agents plugin's contract: the values it keeps in the session's
// $.state. The engine interface it calls, `$.msgate` (`version()`, `backType()`,
// from engine 1.1 `flaggedRuns()` and from engine 1.4 `models()`), is added by
// the msgate engine plugin, not by this one, and is undefined when that plugin is not installed.

declare module 'claude-code' {
  interface PluginState {
    'msgate-agents': {
      // The dispatch skill has loaded in this session, so the agent types are
      // offered to the model.
      dispatchLoaded: boolean
      // The agent types the engine backed at this session's start: only these
      // are offered. Empty when the engine is missing or of another major.
      backedTypes: string[]
      // The names of the model variants registered in this session, kept across
      // a reload of the plugin so each is still recognized as the plugin's own,
      // gate included. Only grows: the host keeps a registered type.
      variants: string[]
      // The session was already told the engine is missing, so a reload of the
      // plugin does not say it again.
      engineNoticeShown: boolean
      // The ids of the runs whose hidden row was tried in this session. A run
      // the engine refused a row never gets one and stays listed, so a reloaded
      // plugin would otherwise try it again. Kept to 200 by dropping the oldest,
      // never one whose run the engine still lists.
      triedRuns: string[]
    }
  }
}
