import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { FIGURE_MAX_COLUMNS, FIGURE_MAX_LINES, checkFigure, figureRuns, figureText, isFigureLang } from '../hooks/figure'
import { PRESETS } from '../hooks/presets'

const lines = (text: string) => text.split('\n')

const CARDS = lines(`{accent:┌─ dev ──────┐}  {accent:╔═ prod ═════╗}
{accent:│} v1.8.0     {accent:│}  {accent:║} {strong:v1.7.2}     {accent:║}
{accent:│} {ok:● healthy}  {accent:│}  {accent:║} {warn:▲ degraded} {accent:║}
{accent:└────────────┘}  {accent:╚════════════╝}`)

const STORE = lines(`              Command ShipOrder
                    │
 ┌─ Handler ────────▼──────┐
 │ status = PAID? ✓        │
 └─────────────────────────┘
 ┌────┴──────────────────────────┐
 │ EVENT STORE · append only     │
 ├──────────┬──────────┬─────────┤
 │v1 Created│v2 +A-100 │v3 Paid  │
 └────┬─────┴──────────┴─────────┘
      ├──▶ customer view   lags a moment
      └──▶ warehouse       own table`)

const TIMELINE = lines(`{note:0 s        10 s  12 s        later}
Provider {accent:●── waits ──}{warn:✗ timeout}     {accent:●} retry, same event
Handler  {ok:■■■■■■■■■■■■■■■} books, 200 into the void
          ┌──┴──┐
          phase 2`)

const ROUNDED = lines(`╭─ before ─╮   ╭─ after ──╮
│ 40 apps  │ → │ 1 app    │
╰──────────╯   ╰──────────╯`)

const FORK = lines(`     │
  ┌──┴──┐
  │     │
  ▼     ▼
 old   new`)

const LEGS = lines(`  ┌──┴──┐
  │     │
  a     b`)

const BRANCH = lines(`┌─▶ fetch      ┌─────────┐
│              │ cache   │
│              └─────────┘
└─▶ store`)

const NESTED = lines(`┌─ app ──────────────┐
│ ┌─ api ──┐ ┌─ db ┐ │
│ │ v2     │ │ pg  │ │
│ └────────┘ └─────┘ │
├────────────────────┤
│ shared config      │
└────────────────────┘`)

const CYCLE = lines(`┌─▶ fetch ─┐
│          ▼
└─◀ store ◀┘`)

const CHILDREN = lines(`    ┌──┴──┐
    │     │
  ┌─┴─┐ ┌─┴─┐
  │ a │ │ b │
  └───┘ └───┘`)

const SIDEWAYS = lines(`  ┌──┴──┐
  │     │
  └─ a  └─ b`)

const ACCENTED = lines(`┌──────┐
│ cafe\u0301 │
└──────┘`)

test('a fence named figure opens a picture, other names do not', () => {
  expect(isFigureLang('figure')).toBe(true)
  expect(isFigureLang('Figure')).toBe(true)
  expect(isFigureLang('art')).toBe(false)
  expect(isFigureLang('')).toBe(false)
})

test('a line splits into runs, each role markup becoming one colored run', () => {
  expect(figureRuns('Handler {ok:■■} books {warn:twice}')).toEqual([
    { text: 'Handler ' },
    { text: '■■', role: 'ok' },
    { text: ' books ' },
    { text: 'twice', role: 'warn' },
  ])
})

test('markup that names no role stays as written', () => {
  expect(figureText('{accent:┌──┐} {id:42} {nope:x}{ok:y}')).toBe('┌──┐ {id:42} {nope:x}y')
})

test('markup with empty text draws nothing', () => {
  expect(figureRuns('a{ok:}b')).toEqual([{ text: 'a' }, { text: 'b' }])
})

test('emoji-capable arrows are drawn as their text forms', () => {
  expect(figureText('a ──▶ b ◀── c')).toBe('a ──► b ◄── c')
})

test('clean pictures have no findings', () => {
  for (const picture of [CARDS, STORE, TIMELINE, ROUNDED, FORK, LEGS, BRANCH, NESTED, CYCLE, CHILDREN, SIDEWAYS, ACCENTED]) expect(checkFigure(picture)).toEqual([])
})

test('a right side that slips one column is found on its line', () => {
  expect(checkFigure(lines('┌────────┐\n│ v1.4.2  │\n└────────┘'))).toEqual([{ line: 2, message: 'right side of the box from line 1 slips out of column 10' }])
})

test('a box that runs to the end of the picture is found on its last line', () => {
  expect(checkFigure(lines('┌────────┐\n│ v1.4.2 │\n│ old    │'))).toEqual([{ line: 3, message: 'box from line 1 does not close on its left side' }])
})

test('a left side that ends in a frame glyph other than a corner is found', () => {
  expect(checkFigure(lines('┌────────┐\n│ v1.4.2 │\n├────────┘'))).toEqual([{ line: 3, message: 'box from line 1 does not close on its left side' }])
})

test('a bottom edge that ends short of the top corner is found', () => {
  expect(checkFigure(lines('┌────────┐\n│ v1.4.2 │\n└───────┘'))).toEqual([{ line: 3, message: 'bottom of the box from line 1 does not end under its top right corner' }])
})

test('glyphs that may draw as emoji are found once per line', () => {
  expect(checkFigure(['⚠ check ✔ done ⚠'])).toEqual([{ line: 1, message: '"⚠", "✔" may draw as an emoji, use a text glyph' }])
  expect(checkFigure(['Deploy 🚀 ok'])).toEqual([{ line: 1, message: '"🚀" may draw as an emoji, use a text glyph' }])
  expect(checkFigure(['✓ ✗ ▶ ◀ ▲ ▼ ● ○ ■ □ → ← · ⧉'])).toEqual([])
})

test('glyphs two columns wide are found once per line', () => {
  expect(checkFigure(['名前 ok'])).toEqual([{ line: 1, message: '"名", "前" take two columns, use one-column glyphs' }])
})

test(`a line wider than ${FIGURE_MAX_COLUMNS} columns is found, wide glyphs counted twice and markup not at all`, () => {
  expect(checkFigure(['x'.repeat(FIGURE_MAX_COLUMNS + 1)])).toEqual([{ line: 1, message: `${FIGURE_MAX_COLUMNS + 1} columns wide, at most ${FIGURE_MAX_COLUMNS}` }])
  expect(checkFigure([`{accent:${'x'.repeat(FIGURE_MAX_COLUMNS)}}`])).toEqual([])
  expect(checkFigure(['名'.repeat(60)]).map(finding => finding.message)).toContain(`120 columns wide, at most ${FIGURE_MAX_COLUMNS}`)
})

test('a tab is found', () => {
  expect(checkFigure(['a\tb'])).toEqual([{ line: 1, message: 'tab, use spaces' }])
})

test('a role in the wrong case or with swapped letters is found, with the roles listed', () => {
  const message = (written: string) => `"${written}" is not a role, roles are accent, warn, ok, note, dim, strong in lower case`
  expect(checkFigure(['{OK:done}'])).toEqual([{ line: 1, message: message('{OK:') }])
  expect(checkFigure(['{wran:x}'])).toEqual([{ line: 1, message: message('{wran:') }])
})

test('markup holding other markup or braces is found', () => {
  expect(checkFigure(['{accent:{ok:x}}'])).toEqual([{ line: 1, message: '"{accent:" holds braces, markup does not nest' }])
  expect(checkFigure(['{warn:map{k}}'])).toEqual([{ line: 1, message: '"{warn:" holds braces, markup does not nest' }])
})

test('markup that is never closed is found', () => {
  expect(checkFigure(['{ok:done'])).toEqual([{ line: 1, message: '"{ok:" is not closed, end it with }' }])
})

test('braces that hold data are no finding', () => {
  expect(checkFigure(['config {id:42} {a:b} {retries:3} {node:api} {os:linux}', '{on:1} {dir:/tmp} {notes:x} {string:x} { ok: true }'])).toEqual([])
})

test('blank lines after a picture do not open its boxes', () => {
  expect(checkFigure(['┌────┐', '│ a  │', '', ''])).toEqual([{ line: 2, message: 'box from line 1 does not close on its left side' }])
})

test('findings come sorted by line', () => {
  const findings = checkFigure(lines('┌────┐\n│ a   │\n└────┘\n⚠'))
  expect(findings.map(finding => finding.line)).toEqual([2, 4])
})

const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

const reply = (text: string, surface: 'terminal' | 'desktop' = 'terminal', columns = 120) => ({
  plugin: 'prismantis',
  surface,
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true },
  viewport: { columns, rows: 40 },
})

const ROLES = ['```figure', '{accent:┌──┐} plain {warn:break}', '{ok:done} {note:10 s} {dim:aside} {strong:key}', '```'].join('\n')

for (const theme of ['catppuccin-mocha', 'github-light'] as const) {
  test(`a figure draws each role in its ${theme} color on terminal and desktop`, { options: { theme } }, async ($, on) => {
    engine(on)
    const colors = PRESETS[theme]
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(reply(ROLES, surface))
      const colorOf = async (text: RegExp) => (await ui.find({ type: 'Text', text }))?.props
      expect((await colorOf(/^┌──┐$/))?.color).toBe(colors.diagram)
      expect((await colorOf(/^ plain $/))?.color).toBe(colors.diagramText)
      expect((await colorOf(/^break$/))?.color).toBe(colors.codeFlag)
      expect((await colorOf(/^done$/))?.color).toBe(colors.codeString)
      expect((await colorOf(/^10 s$/))?.color).toBe(colors.heading)
      expect((await colorOf(/^aside$/))?.color).toBe(colors.codeComment)
      expect((await colorOf(/^key$/))?.color).toBe(colors.strong)
      expect((await colorOf(/^key$/))?.bold).toBe(true)
      expect(await ui.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
      await ui.unmount()
    }
  })
}

test('a figure offers its source and its drawn text as copies', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(reply(ROLES))
  const labels = (await ui.findAll({ type: 'Button' })).map(button => button.props.label)
  expect(labels).toContain('⧉ source')
  expect(labels).toContain('⧉ art')
  await ui.unmount()
})

test('a figure with a finding stays a code block', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(reply(['```figure', '┌────────┐', '│ v1.4.2  │', '└────────┘', '```'].join('\n')))
  expect(await ui.find({ type: 'Text', text: /^── figure$/ })).toBeDefined()
  await ui.unmount()
})

test('a figure wider than the terminal stays a code block', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(reply(['```figure', `{accent:${'─'.repeat(70)}}`, '```'].join('\n'), 'terminal', 60))
  expect(await ui.find({ type: 'Text', text: /^── figure$/ })).toBeDefined()
  await ui.unmount()
})

test('a figure still streaming stays a code block until its fence closes', async ($, on) => {
  engine(on)
  const open = await $.ui.mount(reply(['```figure', '{ok:done} a'].join('\n')))
  expect(await open.find({ type: 'Text', text: /^── figure$/ })).toBeDefined()
  await open.unmount()
  const closed = await $.ui.mount(reply(['```figure', '{ok:done} a', '```'].join('\n')))
  expect(await closed.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
  await closed.unmount()
})

test(`a figure over ${FIGURE_MAX_LINES} lines stays a code block`, async ($, on) => {
  engine(on)
  const figure = (count: number) => ['```figure', ...Array.from({ length: count }, (_, i) => `row ${i}`), '```'].join('\n')
  const long = await $.ui.mount(reply(figure(FIGURE_MAX_LINES + 1)))
  expect(await long.find({ type: 'Text', text: /^── figure$/ })).toBeDefined()
  await long.unmount()
  const fits = await $.ui.mount(reply(figure(FIGURE_MAX_LINES)))
  expect(await fits.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
  await fits.unmount()
})

test('in a theme without colors, warn draws bold and dim draws dimmed', { options: { theme: 'mono' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(reply(ROLES))
  expect((await ui.find({ type: 'Text', text: /^break$/ }))?.props.bold).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^aside$/ }))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('blank lines around a figure are not drawn, blank lines inside are', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(reply(['```figure', '', '{ok:a}', '', 'b', '', '```'].join('\n')))
  const figure = (await ui.findAll({ type: 'Box' })).find(box => box.props.paddingLeft === 2)
  expect(figure?.children?.length).toBe(3)
  expect(figure?.text).toBe('a b')
  await ui.unmount()
})
