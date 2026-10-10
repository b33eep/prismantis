import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { FIGURE_CHECK_TOOL, FIGURE_GLYPHS, FIGURE_HINT, FIGURE_MAX_COLUMNS, FIGURE_MAX_LINES, FIGURE_ROLES, FIGURE_SAFE_COLUMNS, checkFigure, figureRuns, figureText, isFigureLang, reviewFigure } from '../hooks/figure'
import { PRESETS } from '../hooks/presets'
import { width } from '../hooks/render'
import { resolveStyle } from '../hooks/theme'

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

test('the figure hint names the opening line, every role, the width and one-column glyphs', () => {
  expect(FIGURE_HINT).toContain('opening line is exactly ```figure')
  for (const role of FIGURE_ROLES) expect(FIGURE_HINT).toContain(`${role} for `)
  expect(FIGURE_HINT).toContain(`At most ${FIGURE_SAFE_COLUMNS} columns`)
  expect(FIGURE_HINT).toContain(`glyphs one column wide such as ${FIGURE_GLYPHS}`)
  expect(FIGURE_HINT).toContain('markup takes no columns')
})

test('the figure hint asks for a picture first that carries the core, showing what explains it', () => {
  expect(FIGURE_HINT).toContain('lead your chat reply (not files or plans you write with tools) with a picture')
  expect(FIGURE_HINT).toContain('carries the core')
  expect(FIGURE_HINT).toContain('show what explains the core')
  expect(FIGURE_HINT).toContain('flows, sequences and charts stay mermaid')
})

test('the figure hint sizes the pictures to the question and keeps prose to what they do not show', () => {
  expect(FIGURE_HINT).toContain('only when it shows something new')
  expect(FIGURE_HINT).toContain('None for short or yes/no answers, code changes')
  expect(FIGURE_HINT).toContain('never retells them')
  expect(FIGURE_HINT).toContain('give each a ## heading')
})

test('the figure hint keeps picture, prose and lists to the same steps, numbers and order', () => {
  expect(FIGURE_HINT).toContain('Where picture, prose and a list cover the same thing, they use the same steps, states, numbers and order.')
})

test('the figure hint stays under 1850 characters, about the 590 tokens the README states', () => {
  expect(FIGURE_HINT.length).toBeLessThanOrEqual(1850)
})

test('every glyph the figure hint offers passes the checker', () => {
  expect([...FIGURE_GLYPHS].length).toBeGreaterThan(20)
  expect([...FIGURE_GLYPHS].every(glyph => width(glyph) === 1)).toBe(true)
  expect(checkFigure([[...FIGURE_GLYPHS].join(' ')])).toEqual([])
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

const CHECK = `mcp__prismantis__${FIGURE_CHECK_TOOL}`

const SLIPPED = ['┌────────┐', '│ v1.4.2  │', '└────────┘'].join('\n')

test('a review of a figure finds what the checker finds, by line', () => {
  expect(reviewFigure(SLIPPED)).toEqual(checkFigure(lines(SLIPPED)))
  expect(reviewFigure(SLIPPED)).toEqual([{ line: 2, message: 'right side of the box from line 1 slips out of column 10' }])
})

test('a review takes the block with or without its fences, as the parser opens them', () => {
  const expected = reviewFigure(SLIPPED)
  for (const source of [
    ['```figure', SLIPPED, '```'].join('\n'),
    ['```figure', SLIPPED, '```', ''].join('\n'),
    ['', '```figure', SLIPPED, '```'].join('\n'),
    ['~~~figure', SLIPPED, '~~~'].join('\n'),
    ['````Figure title', '', SLIPPED, '````'].join('\n'),
    ['~~~figure', SLIPPED, '~~~~'].join('\n'),
    SLIPPED.replaceAll('\n', '\r\n'),
  ]) expect(reviewFigure(source)).toEqual(expected)
  expect(reviewFigure(CARDS.join('\r\n'))).toEqual([])
  expect(reviewFigure(['~~~figure', 'a', '```'].join('\n'))).toEqual([])
  expect(reviewFigure(['````figure', 'a', '```'].join('\n'))).toEqual([])
})

test(`a review holds lines to ${FIGURE_SAFE_COLUMNS} columns, so the model fixes the width in one round`, () => {
  const wide = `{accent:${'─'.repeat(FIGURE_SAFE_COLUMNS + 1)}}`
  expect(checkFigure([wide])).toEqual([])
  expect(reviewFigure(wide)).toEqual([{ line: 1, message: `${FIGURE_SAFE_COLUMNS + 1} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
  expect(reviewFigure('x'.repeat(FIGURE_MAX_COLUMNS + 20))).toEqual([{ line: 1, message: `${FIGURE_MAX_COLUMNS + 20} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
})

test(`a review finds a figure over ${FIGURE_MAX_LINES} lines, which stays a code block`, () => {
  const long = Array.from({ length: FIGURE_MAX_LINES + 1 }, (_, i) => `step ${i}`).join('\n')
  expect(reviewFigure(long)).toEqual([{ line: FIGURE_MAX_LINES + 1, message: `${FIGURE_MAX_LINES + 1} lines, at most ${FIGURE_MAX_LINES}` }])
})

const closing = (name: string) => `<${'/'}${name}>`

const SCHEMA = [`{accent:${'─'.repeat(69)}}`, ` Migration  DROP COLUMN name       {warn:no rollback from here}`, ` {strong:Every version runs next to the one before it, on the same schema.}`]

const LAST = SCHEMA.at(-1) ?? ''

const ROWS = Array.from({ length: FIGURE_MAX_LINES }, (_, i) => `row ${i}`)

test('a closing tag of a tool call at the end of the last line is no part of the figure under review', () => {
  expect(reviewFigure(SCHEMA.join('\n'))).toEqual([])
  for (const last of [
    `${LAST}${closing('parameter')}`,
    `${LAST}${closing('antml:parameter')}`,
    `${LAST}${closing('function_calls')}`,
    `${LAST}  ${closing('parameter')}  `,
    `${LAST}${closing('parameter')}\r`,
    `${LAST}${closing('parameter')} ${closing('invoke')}`,
  ]) {
    const tagged = [...SCHEMA.slice(0, -1), last].join('\n')
    expect(reviewFigure(tagged)).toEqual([])
    expect(reviewFigure(['```figure', tagged, '```'].join('\n'))).toEqual([])
  }
})

test('closing tags of a tool call on lines of their own at the end are no part of the figure under review', () => {
  expect(reviewFigure([...ROWS, closing('parameter'), closing('invoke')].join('\n'))).toEqual([])
  expect(reviewFigure([...SCHEMA.slice(0, -1), `${LAST}${closing('parameter')}`, '', closing('invoke')].join('\n'))).toEqual([])
})

test('a closing tag anywhere but the end of the last line stays and counts', () => {
  const wide = 'x'.repeat(FIGURE_SAFE_COLUMNS - 4)
  const inner = `${wide}${closing('parameter')}`
  expect(reviewFigure([inner, 'b'].join('\n'))).toEqual([{ line: 1, message: `${width(inner)} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
  const middle = `${closing('parameter')}${wide}`
  expect(reviewFigure(['a', middle].join('\n'))).toEqual([{ line: 2, message: `${width(middle)} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
  const html = `${wide}${closing('div')}`
  expect(reviewFigure(html)).toEqual([{ line: 1, message: `${width(html)} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
})

test('a figure that opens the tag it closes keeps the closing tag', () => {
  const shown = `${'x'.repeat(FIGURE_SAFE_COLUMNS - 4)}${closing('parameter')}`
  expect(reviewFigure(['<parameter name="figure">', shown].join('\n'))).toEqual([{ line: 2, message: `${width(shown)} columns wide, at most ${FIGURE_SAFE_COLUMNS}` }])
})

test('a long run of closing tags on the last line is reviewed quickly', () => {
  const started = Date.now()
  reviewFigure(`${closing('parameter').repeat(20000)}x`)
  expect(Date.now() - started).toBeLessThan(500)
})

test('an empty review asks for the lines of one figure', () => {
  for (const source of ['  \n', '```figure\n```\n', '']) expect(reviewFigure(source)).toEqual([{ line: 1, message: 'no lines, pass the lines of one figure block' }])
})

test('figureCheck is off by default and needs the diagram hints', () => {
  expect(resolveStyle({}).figureCheck).toBe(false)
  expect(resolveStyle({ figureCheck: true }).figureCheck).toBe(true)
  expect(resolveStyle({ figureCheck: true, diagramHints: false }).figureCheck).toBe(false)
  expect(resolveStyle({ figureCheck: true, mermaid: false }).figureCheck).toBe(false)
})

test('the model checks a figure and reads clean or its findings by line', { options: { figureCheck: true } }, async $ => {
  expect(await $.tool.call({ tool: CHECK, figure: CARDS.join('\n') } as never)).toMatchObject({ result: 'clean, it draws as a picture' })
  expect(await $.tool.call({ tool: CHECK, figure: SLIPPED } as never)).toMatchObject({ result: 'line 2: right side of the box from line 1 slips out of column 10' })
  expect(await $.tool.call({ tool: CHECK } as never)).toMatchObject({ result: 'line 1: no lines, pass the lines of one figure block' })
})

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

test('a figure as wide as the hint allows draws in an 80-column window, one column more does not', async ($, on) => {
  engine(on)
  const safe = await $.ui.mount(reply(['```figure', `{accent:${'─'.repeat(FIGURE_SAFE_COLUMNS)}}`, '```'].join('\n'), 'terminal', 80))
  expect(await safe.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
  await safe.unmount()
  const wider = await $.ui.mount(reply(['```figure', `{accent:${'─'.repeat(FIGURE_SAFE_COLUMNS + 1)}}`, '```'].join('\n'), 'terminal', 80))
  expect(await wider.find({ type: 'Text', text: /^── figure$/ })).toBeDefined()
  await wider.unmount()
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

const figureBox = async (ui: { findAll: (query: { type: string }) => Promise<{ props: Record<string, unknown>; text?: string; children?: unknown[] }[]> }) =>
  (await ui.findAll({ type: 'Box' })).find(box => box.props.paddingLeft === 2)

test('a figure whose last line ends in a closing tag of a tool call draws without the tag', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const ending of [[`${LAST}${closing('parameter')}`], [LAST, closing('parameter'), closing('invoke')]]) {
      const ui = await $.ui.mount(reply(['```figure', ...SCHEMA.slice(0, -1), ...ending, '```'].join('\n'), surface, 80))
      expect(await ui.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
      expect((await figureBox(ui))?.children?.length).toBe(SCHEMA.length)
      expect((await figureBox(ui))?.text).toContain('on the same schema.')
      expect((await figureBox(ui))?.text).not.toContain('parameter')
      await ui.unmount()
    }
  }
})

test('a figure keeps a closing tag that does not end its last line, or names no tool call', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [figure, kept] of [
      [[`a${closing('parameter')}`, 'b'], closing('parameter')],
      [[`${closing('parameter')} a`], closing('parameter')],
      [[`a ${closing('div')}`], closing('div')],
      [['<parameter name="a">', `x${closing('parameter')}`], closing('parameter')],
    ] as const) {
      const ui = await $.ui.mount(reply(['```figure', ...figure, '```'].join('\n'), surface))
      expect(await ui.find({ type: 'Text', text: /^── figure$/ })).toBeUndefined()
      expect((await figureBox(ui))?.text).toContain(kept)
      await ui.unmount()
    }
  }
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
  const figure = await figureBox(ui)
  expect(figure?.children?.length).toBe(3)
  expect(figure?.text).toBe('a b')
  await ui.unmount()
})
