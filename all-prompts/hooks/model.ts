import type { PromptEntry, SessionInfo, Snapshot } from '../types'

// What a live session's ~/.claude/sessions/<pid>.json carries that we use.
export type SessionFile = {
  pid?: number
  sessionId?: string
  name?: string
  status?: string
}

// Names remembered per session id, so prompts typed before a /clear (which
// gives the same terminal a new session id) still show that terminal's name.
export type NameCache = Record<string, { name: string; pid?: number }>

export function parseHistory(text: string): PromptEntry[] {
  const out: PromptEntry[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    if (typeof r.display !== 'string' || typeof r.sessionId !== 'string') continue
    out.push({
      ts: typeof r.timestamp === 'number' ? r.timestamp : 0,
      text: r.display,
      sessionId: r.sessionId,
      project: typeof r.project === 'string' ? r.project : '',
    })
  }
  return out
}

export function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function buildSessions(
  files: readonly SessionFile[],
  cache: NameCache,
  prompts: readonly PromptEntry[],
): Record<string, SessionInfo> {
  const sessions: Record<string, SessionInfo> = {}
  const livePids = new Set<number>()
  for (const f of files) {
    if (f.sessionId === undefined) continue
    if (f.pid !== undefined) livePids.add(f.pid)
    sessions[f.sessionId] = {
      name: f.name ?? f.sessionId.slice(0, 8),
      pid: f.pid,
      status: f.status,
      isLive: true,
    }
  }
  for (const p of prompts) {
    if (sessions[p.sessionId] !== undefined) continue
    const known = cache[p.sessionId]
    if (known !== undefined) {
      // Same terminal still open under a newer session id (after /clear).
      const isLive = known.pid !== undefined && livePids.has(known.pid)
      sessions[p.sessionId] = {
        name: isLive ? `${known.name} (pre-clear)` : known.name,
        pid: known.pid,
        isLive,
      }
    } else {
      sessions[p.sessionId] = {
        name: `${basename(p.project)}·${p.sessionId.slice(0, 4)}`,
        isLive: false,
      }
    }
  }
  return sessions
}

export function mergeCache(cache: NameCache, files: readonly SessionFile[]): NameCache {
  const next: NameCache = { ...cache }
  for (const f of files) {
    if (f.sessionId === undefined || f.name === undefined) continue
    next[f.sessionId] = { name: f.name, pid: f.pid }
  }
  return next
}

export function age(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const PALETTE = ['cyan', 'magenta', 'yellow', 'green', 'blue', '#ff8700', '#5fafff', '#d787ff']

export function colorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length] ?? 'cyan'
}

export function visible(
  snap: Snapshot,
  filter: string,
  isHidingCommands: boolean,
  limit: number,
): PromptEntry[] {
  const q = filter.trim().toLowerCase()
  const out: PromptEntry[] = []
  for (let i = snap.prompts.length - 1; i >= 0 && out.length < limit; i--) {
    const p = snap.prompts[i]
    if (p === undefined) continue
    if (isHidingCommands && p.text.startsWith('/')) continue
    if (q !== '') {
      const name = snap.sessions[p.sessionId]?.name ?? ''
      if (!p.text.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) continue
    }
    out.push(p)
  }
  return out
}

export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) : flat
}
