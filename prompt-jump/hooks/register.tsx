import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { JumpState, PromptRow } from '../types'
import { oneLine, parsePrompts, step } from './model'

// The engine actions whose chords press the band's buttons. Their defaults
// (option+up / option+down, ctrl+up / ctrl+down) don't reach Claude Code from
// Mac Terminal without extra setup, so ~/.claude/keybindings.json also binds
// them to option+k / option+j. While the diff panel is open it keeps them.
const UP_ACTION = 'app:diffFileListUp'
const DOWN_ACTION = 'app:diffFileListDown'
const HUMAN = '"origin":{"kind":"human"}'

const jump = atom({ plugin: 'prompt-jump', key: 'jump' } as const, {
  index: -1,
  total: 0,
  text: '',
} as JumpState)

type $ = EngineInterface

// Transcript path per session id; a /clear starts a new id and a new file.
const paths = new Map<string, string>()

async function transcriptPath($: $): Promise<string | undefined> {
  const id = await $.session.id()
  const known = paths.get(id)
  if (known !== undefined) return known
  const home = (await $.env.get('HOME')) ?? ''
  const found = await $.process.run([
    'find',
    `${home}/.claude/projects`,
    '-maxdepth',
    '2',
    '-name',
    `${id}.jsonl`,
  ])
  const path = found.stdout.split('\n').find(line => line.trim() !== '')
  if (path !== undefined) paths.set(id, path.trim())
  return path?.trim()
}

// This session's typed prompts, oldest first, read fresh on every press.
// grep keeps only the candidate lines, so a 30 MB transcript stays cheap.
async function loadPrompts($: $): Promise<PromptRow[]> {
  const path = await transcriptPath($)
  if (path === undefined) return []
  const lines = await $.process.run(['grep', '-F', HUMAN, path])
  return parsePrompts(lines.stdout)
}

async function move($: $, dir: -1 | 1): Promise<void> {
  const prompts = await loadPrompts($)
  const cur = await read($, jump)
  // A prompt sent since the last jump shifts nothing: indices count from
  // the oldest, and -1 (not navigating) always starts from the newest.
  const index = step(cur.index, prompts.length, dir)
  const target = prompts[index]
  if (target === undefined) {
    await update($, jump, () => ({ index: -1, total: prompts.length, text: '' }))
    return
  }
  // The position moves even when the scroll is refused, and says why.
  const note = await $.ui
    .scroll({ to: { requestId: target.uuid }, block: 'start' })
    .then(moved => moved.deny)
    .catch((err: unknown) => (err instanceof Error ? err.message : String(err)))
  await update($, jump, () => ({
    index,
    total: prompts.length,
    text: target.text,
    ...(note !== undefined ? { note } : {}),
  }))
}

export const register: Register = on => {
  // Typing a new prompt ends a navigation: the next ↑ starts from the newest.
  on('prompt.submit', async ($, e, next) => {
    await update($, jump, s => ({ ...s, index: -1, text: '', note: undefined }))
    return next(e)
  }).catch(($, e, next) => next(e)) // never hold up a prompt over this

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const state = await read($, jump)
    const width = Math.max(20, e.props.bodyColumns)
    const isNavigating = state.index >= 0

    const where = isNavigating ? `${state.index + 1}/${state.total} ` : ''
    const label = isNavigating
      ? oneLine(state.text, Math.max(10, width - where.length - 14))
      : 'option+k previous prompt · option+j next'

    return (
      <Box gap={1}>
        <Button
          key="up"
          plain
          dimColor
          action={UP_ACTION}
          onPress={() => move($, -1)}
        >
          ↑
        </Button>
        <Button
          key="down"
          plain
          dimColor
          action={DOWN_ACTION}
          onPress={() => move($, 1)}
        >
          ↓
        </Button>
        <Text dimColor wrap="truncate-end">
          {where}
          {label}
          {state.note !== undefined ? ` (${state.note})` : ''}
        </Text>
      </Box>
    )
  })
}
