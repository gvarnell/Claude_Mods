import type { PromptRow } from '../types'

// The person's typed prompts in a transcript file's lines, oldest first: user
// rows the composer stamped (`"origin":{"kind":"human"}`), outside subagents.
export function parsePrompts(text: string): PromptRow[] {
  const out: PromptRow[] = []
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
    if (r.type !== 'user' || r.isMeta === true || r.isSidechain === true) continue
    const origin = r.origin as { kind?: unknown } | undefined
    if (origin?.kind !== 'human' || typeof r.uuid !== 'string') continue
    out.push({ uuid: r.uuid, text: promptText(r.message) })
  }
  return out
}

function promptText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    const b = block as { type?: unknown; text?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') return b.text
  }
  return '[image]'
}

// Where ↑ (-1) or ↓ (+1) lands from `index`, -1 meaning "at the bottom, not
// navigating". ↑ from the bottom is the newest prompt; ↓ past the newest
// returns to the bottom; ↑ at the oldest stays there.
export function step(index: number, total: number, dir: -1 | 1): number {
  if (total === 0) return -1
  if (index < 0 || index >= total) return dir === -1 ? total - 1 : -1
  const next = index + dir
  if (next < 0) return 0
  if (next >= total) return -1
  return next
}

export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1))}…` : flat
}

// ~/.claude/projects/<slug>/: the slug is the session's starting directory
// with every character that is not a letter or digit turned into '-'.
export function projectSlug(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, '-')
}
