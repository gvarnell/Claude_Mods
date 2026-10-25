export type PromptEntry = {
  ts: number
  text: string
  sessionId: string
  project: string
}

export type SessionInfo = {
  name: string
  pid?: number
  status?: string
  isLive: boolean
}

export type Snapshot = {
  prompts: PromptEntry[]
  sessions: Record<string, SessionInfo>
  selfId: string
  now: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'all-prompts': {
      snapshot: Snapshot
      filter: string
      expanded: string
      isHidingCommands: boolean
    }
  }
}
