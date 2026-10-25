import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot } from '../types'
import {
  age,
  buildSessions,
  colorFor,
  mergeCache,
  oneLine,
  parseHistory,
  visible,
} from './model'
import type { NameCache, SessionFile } from './model'

const PANE = 'all-prompts'
const TITLE = 'All prompts'
const POLL_MS = 3000
const TAIL_LINES = 2000
const MAX_ROWS = 150
const CACHE_KEY = 'names'
const CACHE_LIMIT = 500
// Kept across sessions: true once the person hid the column, so new
// sessions start with it hidden until they show it again.
const HIDDEN_KEY = 'isHidden'

const EMPTY: Snapshot = { prompts: [], sessions: {}, selfId: '', now: 0 }

const snapshot = atom({ plugin: 'all-prompts', key: 'snapshot' } as const, EMPTY)
const filter = atom({ plugin: 'all-prompts', key: 'filter' } as const, '')
const expanded = atom({ plugin: 'all-prompts', key: 'expanded' } as const, '')
const isHidingCommands = atom(
  { plugin: 'all-prompts', key: 'isHidingCommands' } as const,
  true,
)

type $ = EngineInterface

async function readSessionFiles($: $, dir: string): Promise<SessionFile[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  const files: SessionFile[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    try {
      files.push(JSON.parse(await $.fs.read(`${dir}/${entry.name}`)) as SessionFile)
    } catch {
      // a session file mid-write; the next poll reads it
    }
  }
  return files
}

async function loadCache($: $): Promise<NameCache> {
  const stored = await $.store.get(CACHE_KEY)
  return typeof stored === 'object' && stored !== null ? (stored as NameCache) : {}
}

async function saveCache($: $, cache: NameCache): Promise<void> {
  const keys = Object.keys(cache)
  const kept: NameCache = {}
  for (const k of keys.slice(-CACHE_LIMIT)) {
    const v = cache[k]
    if (v !== undefined) kept[k] = v
  }
  await $.store.set(CACHE_KEY, kept)
}

// The module's own bookkeeping; a reload starts it over and simply redraws.
const poll = { signature: '', drawnAt: 0, isRunning: false }

async function refresh($: $): Promise<void> {
  if (poll.isRunning) return
  poll.isRunning = true
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const historyPath = `${home}/.claude/history.jsonl`
    const sessionsDir = `${home}/.claude/sessions`

    const [stat, files, selfId, now] = await Promise.all([
      $.fs.stat(historyPath).catch(() => undefined),
      readSessionFiles($, sessionsDir),
      $.session.id(),
      $.clock.now(),
    ])
    const signature = [
      stat?.mtimeMs ?? 0,
      selfId,
      ...files.map(f => `${f.sessionId}:${f.name}:${f.status}`).sort(),
    ].join('|')
    // Redraw when something changed, and every half minute for the ages.
    if (signature === poll.signature && now - poll.drawnAt < 30_000) return

    const tail = await $.process.run(['tail', '-n', String(TAIL_LINES), historyPath])
    const prompts = parseHistory(tail.stdout)
    const cache = mergeCache(await loadCache($), files)
    await saveCache($, cache)

    const next: Snapshot = {
      prompts,
      sessions: buildSessions(files, cache, prompts),
      selfId,
      now,
      ...(tail.exitCode === 0 ? {} : { error: tail.stderr.trim() || 'could not read history' }),
    }
    await update($, snapshot, () => next)
    poll.signature = signature
    poll.drawnAt = now
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, snapshot, s => ({ ...s, error: message }))
  } finally {
    poll.isRunning = false
  }
}

async function isPaneOpen($: $): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

async function showPane($: $): Promise<void> {
  await $.store.set(HIDDEN_KEY, false)
  await refresh($)
  await $.ui.open({ id: PANE, title: TITLE })
}

async function hidePane($: $): Promise<void> {
  await $.store.set(HIDDEN_KEY, true)
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompts',
      description: 'Show or hide the column of your prompts from every session',
      argumentHint: '[show|hide]',
      immediate: true,
    })
    void refresh($)
    $.clock.every(POLL_MS, () => void refresh($))
    const isHidden = (await $.store.get(HIDDEN_KEY)) === true
    if (e.isInteractive && !isHidden) void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'prompts' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const wantsShow = arg === 'show' || (arg !== 'hide' && !(await isPaneOpen($)))
    if (wantsShow) {
      await showPane($)
      return { text: 'All-prompts column shown. /prompts again hides it.' }
    }
    await hidePane($)
    return { text: 'All-prompts column hidden. /prompts brings it back.' }
  })

  // Closing it by its close mark or ctrl+x x counts as hiding it too.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await $.store.set(HIDDEN_KEY, true)
    return next(e)
  }).catch(($, e, next) => next(e)) // never keep the pane open over a failed save

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // Every surface but mobile can take a filter field.
    const Input = 'Input' in elements ? elements.Input : undefined
    const snap = await read($, snapshot)
    const query = await read($, filter)
    const open = await read($, expanded)
    const hiding = await read($, isHidingCommands)
    const width = Math.max(20, e.props.bodyColumns)
    const rows = visible(snap, query, hiding, MAX_ROWS)
    const liveCount = Object.values(snap.sessions).filter(s => s.isLive).length

    const list: ReturnType<typeof h>[] = []
    let prevSession = ''
    for (const p of rows) {
      const info = snap.sessions[p.sessionId]
      const name = info?.name ?? p.sessionId.slice(0, 8)
      const isSelf = p.sessionId === snap.selfId
      const key = `${p.sessionId}:${p.ts}`
      if (p.sessionId !== prevSession) {
        list.push(
          <Box key={`h-${key}`} marginTop={prevSession === '' ? 0 : 1}>
            <Text color={colorFor(name)} bold wrap="truncate-end">
              {info?.isLive ? '● ' : '○ '}
              {name}
              {isSelf ? ' (this session)' : ''}
            </Text>
          </Box>,
        )
        prevSession = p.sessionId
      }
      const stamp = age(p.ts, snap.now)
      const room = Math.max(8, width - stamp.length - 3)
      list.push(
        <Button
          key={key}
          plain
          onPress={() => update($, expanded, cur => (cur === key ? '' : key))}
        >
          <Text dimColor>{stamp.padStart(4)} </Text>
          {oneLine(p.text, room)}
        </Button>,
      )
      if (open === key) {
        list.push(
          <Box key={`x-${key}`} flexDirection="column" paddingLeft={2} marginBottom={1}>
            <Text wrap="wrap">{p.text}</Text>
            <Text dimColor wrap="truncate-end">
              {new Date(p.ts).toLocaleString()} · {p.project}
            </Text>
            <Box gap={1}>
              <Button
                key={`cp-${key}`}
                label="Copy prompt"
                onPress={press => void $.ui.copy({ text: p.text, surface: press.surface })}
              />
              <Button
                key={`cr-${key}`}
                label="Copy resume cmd"
                onPress={press =>
                  void $.ui.copy({
                    text: `cd ${p.project} && claude --resume ${p.sessionId}`,
                    surface: press.surface,
                  })
                }
              />
            </Box>
          </Box>,
        )
      }
    }

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor>
            {liveCount} live · {rows.length} shown
          </Text>
          <Button
            key="toggle-commands"
            plain
            dimColor
            onPress={() => update($, isHidingCommands, v => !v)}
          >
            {hiding ? '[/cmds hidden]' : '[/cmds shown]'}
          </Button>
          <Button
            key="hide"
            plain
            dimColor
            role="dismiss"
            onPress={() => void hidePane($)}
          >
            [hide]
          </Button>
        </Box>
        {Input !== undefined && (
          <Input
            key="filter"
            placeholder="filter by text or session…"
            value={query}
            submitLabel="filter"
            onInput={(v: string) => void update($, filter, () => v)}
            onSubmit={(v: string) => void update($, filter, () => v)}
          />
        )}
        {snap.error !== undefined && <Text color="error">{snap.error}</Text>}
        {rows.length === 0 && (
          <Text dimColor>{snap.now === 0 ? 'Loading…' : 'No prompts match.'}</Text>
        )}
        {list}
      </Box>
    )
  })
}
