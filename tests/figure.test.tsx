import { expect, test } from 'claude-code/testing'

import { FIGURE_MAX_COLUMNS, checkFigure, figureRuns, figureText, isFigureLang } from '../hooks/figure'

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
