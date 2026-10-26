export type PromptRow = {
  uuid: string
  text: string
}

export type JumpState = {
  // Index into the session's prompts of the one last jumped to; -1 when
  // not navigating (the next ↑ goes to the newest prompt).
  index: number
  total: number
  text: string
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-jump': {
      jump: JumpState
    }
  }
}
