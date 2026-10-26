import { expect, mock, test } from 'claude-code/testing'

import { parsePrompts, step } from '../hooks/model'

const ROWS = [
  '{"type":"user","isMeta":true,"uuid":"m1","origin":{"kind":"human"},"message":{"content":"meta"}}',
  '{"type":"user","uuid":"p1","origin":{"kind":"human"},"message":{"role":"user","content":"first prompt"}}',
  '{"type":"user","uuid":"c1","message":{"content":"<command-name>/clear</command-name>"}}',
  '{"type":"user","uuid":"s1","isSidechain":true,"origin":{"kind":"human"},"message":{"content":"subagent"}}',
  '{"type":"assistant","uuid":"a1","origin":{"kind":"human"},"message":{"content":"reply"}}',
  '{"type":"user","uuid":"p2","origin":{"kind":"human"},"message":{"content":[{"type":"text","text":"second prompt"}]}}',
  'not json',
  '{"type":"user","uuid":"p3","origin":{"kind":"human"},"message":{"content":"third prompt"}}',
].join('\n')

test('finds only the typed prompts, oldest first', () => {
  expect(parsePrompts(ROWS).map(p => [p.uuid, p.text])).toEqual([
    ['p1', 'first prompt'],
    ['p2', 'second prompt'],
    ['p3', 'third prompt'],
  ])
})

test('up from the bottom goes to the newest, down past it returns', () => {
  expect(step(-1, 3, -1)).toBe(2)
  expect(step(2, 3, -1)).toBe(1)
  expect(step(0, 3, -1)).toBe(0)
  expect(step(1, 3, 1)).toBe(2)
  expect(step(2, 3, 1)).toBe(-1)
  expect(step(-1, 3, 1)).toBe(-1)
  expect(step(-1, 0, -1)).toBe(-1)
})

test('up and down walk the prompts and show where you are', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  on('session.id', async () => ({ value: 'sess' }))
  on('process.run', async (_$, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'find' ? '/home/me/.claude/projects/x/sess.jsonl\n' : ROWS,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  // The transcript scroll itself has no stand-in here; it is the engine's.
  const ui = await $.ui.mount({
    plugin: 'prompt-jump',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 5,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 5 },
      view: {},
    },
  })

  await ui.press({ key: 'up' })
  expect((await ui.find({ type: 'Text', text: /3\/3 third prompt/ })) !== undefined).toBe(true)
  await ui.press({ key: 'up' })
  expect((await ui.find({ type: 'Text', text: /2\/3 second prompt/ })) !== undefined).toBe(true)
  await ui.press({ key: 'down' })
  expect((await ui.find({ type: 'Text', text: /3\/3 third prompt/ })) !== undefined).toBe(true)
  await ui.press({ key: 'down' })
  expect((await ui.find({ type: 'Text', text: /option\+k previous prompt/ })) !== undefined).toBe(true)
  await ui.unmount()
})
