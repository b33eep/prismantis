import type { ElementTable, RenderElement } from 'claude-code'

import { cells, graphemes, width } from './render'
import type { Style, Theme } from './theme'

export const FIGURE_ROLES = ['accent', 'warn', 'ok', 'note', 'dim', 'strong'] as const

export type FigureRole = (typeof FIGURE_ROLES)[number]

export type FigureRun = { text: string; role?: FigureRole }

export type FigureFinding = { line: number; message: string }

export const FIGURE_MAX_COLUMNS = 100

export const FIGURE_MAX_LINES = 80

export const FIGURE_SAFE_COLUMNS = 74

export const FIGURE_GLYPHS = '─│┌┐└┘├┤┬┴┼═║→←►◄▲▼✓✗●○■□·'

const ROLE_USES: Record<FigureRole, string> = {
  accent: 'frames, lines and arrows',
  warn: 'the break or risk',
  ok: 'healthy or done',
  note: 'time and effort',
  dim: 'side notes',
  strong: 'the one thing that matters',
}

export const FIGURE_HINT = [
  'A fenced block whose opening line is exactly ```figure is drawn as a text picture.',
  'Draw one when text tells the core of a reply badly: events that overlap in time or need to be seen to scale (a timeout, a race, versions side by side), a layout, before and after, or an overview of the whole answer; flows, sequences and charts stay mermaid.',
  'Place it right after the sentence it shows and the first picture on the first screen; at most two per reply, none for side points, for what a table already shows, or in short answers.',
  `Every line is drawn as written. Color with {role:text}, not nested: ${FIGURE_ROLES.map(role => `${role} for ${ROLE_USES[role]}`).join('; ')}.`,
  'One idea per picture, labels in place, no legend.',
  `At most ${FIGURE_SAFE_COLUMNS} columns so it fits an 80-column window, glyphs one column wide such as ${FIGURE_GLYPHS}, no emoji, no tabs. Count columns so frames close and vertical lines stay in their column; markup takes no columns, count only the drawn text. A picture with a frame that does not close, a wide glyph, a tab or wrong markup shows as plain code.`,
].join(' ')

const MARKUP = new RegExp(`\\{(${FIGURE_ROLES.join('|')}):([^{}]*)\\}`, 'g')
const MARKER = /\{([A-Za-z][\w-]*):/g
const TEXT_FORMS: Record<string, string> = { '▶': '►', '◀': '◄' }
const ROLE_TOKENS: Record<FigureRole, keyof Theme> = { accent: 'diagram', warn: 'codeFlag', ok: 'codeString', note: 'heading', dim: 'codeComment', strong: 'strong' }
const EMOJI_CAPABLE = /\p{Extended_Pictographic}/u
const FRAME_GLYPH = /[─-╿]/
const TOP_LEFT = '┌╔╭┏'
const TOP_RIGHT = '┐╗╮┓'
const BOTTOM_LEFT = '└╚╰┗'
const BOTTOM_RIGHT = '┘╝╯┛'
const SIDE = '│║┃├┤┼╟╢╠╣┝┥┠┨╞╡╪╫'
const ARROW_SIDE = '►◄▲▼'
const INTO_EDGE = '┴┷┸╧╨╩'
const BOTTOM_RUN = '─═━┴┬┼┷┯┿╧╤╪'

const isRole = (name: string | undefined): name is FigureRole => FIGURE_ROLES.some(role => role === name)

export const isFigureLang = (lang: string): boolean => lang.toLowerCase() === 'figure'

const textForm = (text: string): string => text.replace(/[▶◀]/g, glyph => TEXT_FORMS[glyph] ?? glyph)

export const figureRuns = (line: string): FigureRun[] => {
  const runs: FigureRun[] = []
  let at = 0
  for (const match of line.matchAll(MARKUP)) {
    const [whole, role, text = ''] = match
    if (match.index > at) runs.push({ text: textForm(line.slice(at, match.index)) })
    if (text && isRole(role)) runs.push({ text: textForm(text), role })
    at = match.index + whole.length
  }
  if (at < line.length) runs.push({ text: textForm(line.slice(at)) })
  return runs
}

export const figureText = (line: string): string => figureRuns(line).map(run => run.text).join('')

const swapsTwoLetters = (name: string, role: string): boolean => {
  if (name.length !== role.length) return false
  const differ = [...name].flatMap((letter, i) => (letter === role[i] ? [] : [i]))
  const [first = -1, second = -1] = differ
  return differ.length === 2 && second === first + 1 && name[first] === role[second] && name[second] === role[first]
}

const markupMessage = (line: string, marker: RegExpExecArray, drawn: ReadonlySet<number>): string | undefined => {
  const [written, name = ''] = marker
  if (drawn.has(marker.index)) return undefined
  const lower = name.toLowerCase()
  const role = FIGURE_ROLES.find(candidate => candidate === lower || swapsTwoLetters(lower, candidate))
  if (!role) return undefined
  if (name !== role) return `"${written}" is not a role, roles are ${FIGURE_ROLES.join(', ')} in lower case`
  const rest = line.slice(marker.index + written.length)
  if (!rest.includes('}')) return `"${written}" is not closed, end it with }`
  return `"${written}" holds braces, markup does not nest`
}

const markupMessages = (line: string): string[] => {
  const drawn = new Set([...line.matchAll(MARKUP)].map(match => match.index))
  return [...line.matchAll(MARKER)].flatMap(marker => markupMessage(line, marker, drawn) ?? [])
}

const quoted = (glyphs: readonly string[]): string => [...new Set(glyphs)].map(glyph => `"${glyph}"`).join(', ')

const lineMessages = (line: string): string[] => {
  const text = figureText(line)
  const glyphs = graphemes(text)
  const emoji = glyphs.filter(glyph => EMOJI_CAPABLE.test(glyph))
  const wide = glyphs.filter(glyph => !EMOJI_CAPABLE.test(glyph) && width(glyph) === 2)
  const columns = width(text)
  return [
    ...(columns > FIGURE_MAX_COLUMNS ? [`${columns} columns wide, at most ${FIGURE_MAX_COLUMNS}`] : []),
    ...(text.includes('\t') ? ['tab, use spaces'] : []),
    ...(emoji.length ? [`${quoted(emoji)} may draw as an emoji, use a text glyph`] : []),
    ...(wide.length ? [`${quoted(wide)} take two columns, use one-column glyphs`] : []),
    ...markupMessages(line),
  ]
}

const isSide = (cell: string | undefined): boolean => cell !== undefined && SIDE.includes(cell)

const rightCorner = (row: readonly string[], left: number): number => {
  for (let column = left + 1; column < row.length; column++) {
    const cell = row[column] ?? ''
    if (TOP_LEFT.includes(cell)) return -1
    if (TOP_RIGHT.includes(cell)) return column
  }
  return -1
}

const boxFinding = (grid: readonly (readonly string[])[], top: number, left: number): FigureFinding | undefined => {
  if (!isSide(grid[top + 1]?.[left])) return undefined
  const right = rightCorner(grid[top] ?? [], left)
  if (right < 0) return undefined
  let bottom = top + 1
  while (isSide(grid[bottom]?.[left])) bottom++
  const box = `box from line ${top + 1}`
  if (bottom === grid.length) return { line: bottom, message: `${box} does not close on its left side` }
  const end = grid[bottom]?.[left]
  if (end === undefined || !FRAME_GLYPH.test(end) || INTO_EDGE.includes(end)) return undefined
  if (!BOTTOM_LEFT.includes(end)) return { line: bottom + 1, message: `${box} does not close on its left side` }
  const slipped = grid.slice(top + 1, bottom).findIndex(row => !isSide(row[right]) && !ARROW_SIDE.includes(row[right] ?? ' '))
  if (slipped >= 0) return { line: top + 2 + slipped, message: `right side of the ${box} slips out of column ${right + 1}` }
  const edge = grid[bottom] ?? []
  let stop = left + 1
  while (BOTTOM_RUN.includes(edge[stop] ?? '')) stop++
  const isCorner = BOTTOM_RIGHT.includes(edge[stop] ?? ' ')
  const closesUnderCorner = stop === right && isCorner
  const turnsAside = stop < right && !isCorner
  if (closesUnderCorner || turnsAside) return undefined
  return { line: bottom + 1, message: `bottom of the ${box} does not end under its top right corner` }
}

const boxFindings = (lines: readonly string[]): FigureFinding[] => {
  const grid = lines.map(line => cells(figureText(line)))
  return grid.flatMap((row, top) => row.flatMap((cell, left) => (TOP_LEFT.includes(cell) ? (boxFinding(grid, top, left) ?? []) : [])))
}

const withoutTrailingBlanks = (lines: readonly string[]): readonly string[] => {
  let end = lines.length
  while (end > 0 && !lines[end - 1]?.trim()) end--
  return lines.slice(0, end)
}

export const checkFigure = (lines: readonly string[]): FigureFinding[] => {
  const perLine = lines.flatMap((line, index) => lineMessages(line).map(message => ({ line: index + 1, message })))
  return [...perLine, ...boxFindings(withoutTrailingBlanks(lines))].sort((a, b) => a.line - b.line)
}

const withoutBlankEdges = (lines: readonly string[]): readonly string[] => {
  const start = lines.findIndex(line => line.trim())
  return start < 0 ? [] : withoutTrailingBlanks(lines.slice(start))
}

const runColor = (style: Style, role: FigureRole | undefined): string | undefined => style.theme[role ? ROLE_TOKENS[role] : 'diagramText']

const isBold = (style: Style, role: FigureRole | undefined): boolean => role === 'strong' || (role === 'warn' && !style.theme.codeFlag)

const figureElement = ({ Box, Text }: ElementTable, style: Style, lines: readonly string[], key: string): RenderElement => (
  <Box key={key} flexDirection="column" paddingLeft={2}>
    {lines.map((line, i) => {
      const runs = figureRuns(line)
      return (
        <Text key={`${key}.${i}`}>
          {runs.length
            ? runs.map((run, r) => (
                <Text key={`r${r}`} color={runColor(style, run.role)} bold={isBold(style, run.role)} dimColor={run.role === 'dim' && !style.theme.codeComment}>
                  {run.text}
                </Text>
              ))
            : ' '}
        </Text>
      )
    })}
  </Box>
)

export const drawFigure = (el: ElementTable, style: Style, block: { lines: readonly string[]; isOpen?: true }, columns: number, key: string): { element: RenderElement; art: string } | null => {
  if (block.isOpen) return null
  const lines = withoutBlankEdges(block.lines)
  if (lines.length === 0 || lines.length > FIGURE_MAX_LINES || checkFigure(lines).length > 0) return null
  const texts = lines.map(figureText)
  if (texts.some(text => width(text) > columns - 2)) return null
  return { element: figureElement(el, style, lines, key), art: texts.join('\n') }
}
