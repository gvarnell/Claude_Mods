import { expect, mock, test } from 'claude-code/testing'

import { buildSessions, mergeCache, parseHistory, visible } from '../hooks/model'

const HISTORY = [
  '{"display":"fix the billing bug","timestamp":1000,"project":"/Users/me/Dev/v5","sessionId":"aaaa1111"}',
  'not json',
  '{"display":"/clear","timestamp":2000,"project":"/Users/me/Dev/v5","sessionId":"aaaa1111"}',
  '{"display":"open the PR","timestamp":3000,"project":"/Users/me/Dev/v5","sessionId":"bbbb2222"}',
  '{"display":"old thing","timestamp":4000,"project":"/Users/me/Dev/other","sessionId":"cccc3333"}',
  '{"display":"after clear","timestamp":5000,"project":"/Users/me/Dev/v5","sessionId":"dddd4444"}',
].join('\n')

test('labels each prompt with the session it was typed in', async () => {
  const prompts = parseHistory(HISTORY)
  expect(prompts.length).toBe(5)

  // Terminal pid 1 was "v5-bd" as aaaa1111, then /clear made it dddd4444.
  const cache = mergeCache({}, [{ pid: 1, sessionId: 'aaaa1111', name: 'v5-bd' }])
  const live = [
    { pid: 1, sessionId: 'dddd4444', name: 'v5-bd', status: 'idle' },
    { pid: 2, sessionId: 'bbbb2222', name: 'v5-2e', status: 'busy' },
  ]
  const sessions = buildSessions(live, mergeCache(cache, live), prompts)

  expect(sessions.bbbb2222?.name).toBe('v5-2e')
  expect(sessions.bbbb2222?.isLive).toBe(true)
  expect(sessions.aaaa1111?.name).toBe('v5-bd (pre-clear)')
  expect(sessions.aaaa1111?.isLive).toBe(true)
  expect(sessions.cccc3333?.name).toBe('other·cccc')
  expect(sessions.cccc3333?.isLive).toBe(false)

  const snap = { prompts, sessions, selfId: 'dddd4444', now: 6000 }
  expect(visible(snap, '', true, 10).map(p => p.text)).toEqual([
    'after clear',
    'old thing',
    'open the PR',
    'fix the billing bug',
  ])
  expect(visible(snap, '', false, 10).length).toBe(5)
  expect(visible(snap, 'billing', true, 10).map(p => p.sessionId)).toEqual(['aaaa1111'])
  expect(visible(snap, 'v5-2e', true, 10).map(p => p.text)).toEqual(['open the PR'])
})

test('the pane draws on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'all-prompts',
      surface,
      component: 'Pane',
      requestId: 'all-prompts',
      props: {
        title: 'All prompts',
        isFocused: false,
        bodyColumns: 50,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 },
        view: {},
      },
      viewport: { columns: 160, rows: 50, isFullscreen: true },
    })
    expect(await ui.find({ key: 'toggle-commands' })).toBeDefined()
    await ui.unmount()
  }
})

test('/prompts toggles the column and remembers it is hidden', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', async (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  mock.env(on, { HOME: '/nowhere' })
  // The engine's pane bookkeeping, reduced to the set of open ids.
  const open = new Set<string>()
  on('ui.open', async (_$, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', async (_$, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', async () => ({
    value: [...open].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  const isOpen = async () => open.has('all-prompts')
  // As the person typing `/prompts <args>` at a fullscreen terminal.
  const typed = (args: string) =>
    $.command.run({
      command: 'prompts',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })

  await typed('show')
  expect(await isOpen()).toBe(true)

  await typed('')
  expect(await isOpen()).toBe(false)
  expect(store.get('isHidden')).toBe(true)

  await typed('')
  expect(await isOpen()).toBe(true)
  expect(store.get('isHidden')).toBe(false)

  await typed('hide')
  expect(await isOpen()).toBe(false)
})
