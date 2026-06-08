export class InvalidSourceLineError extends Error {
  constructor(invalidLines) {
    const details = invalidLines
      .map(({ lineNumber }) => `line ${lineNumber}`)
      .join('\n')

    super(`Invalid Source Line${invalidLines.length === 1 ? '' : 's'}:\n${details}`)
    this.name = 'InvalidSourceLineError'
    this.invalidLines = invalidLines
  }
}

const VARIABLE_NAME_PATTERN = '[A-Za-z_][A-Za-z0-9_]*'
const VARIABLE_DECLARATION_PATTERN = new RegExp(
  `^\\s*(?:export\\s+)?(${VARIABLE_NAME_PATTERN})\\s*=\\s*(.*)$`,
)

/**
 * Parses source text into the Sync-specific document shape consumed by the renderer.
 *
 * The document keeps source order, comments, blank lines, inline comments, and the
 * Effective Variable set while intentionally treating source values as disposable.
 */
export function parseEnvironmentDocument(sourceText) {
  const lines = splitSourceLines(sourceText)
  const tokens = []
  const variables = []
  const invalidLines = []

  for (let lineIndex = 0; lineIndex < lines.length;) {
    const lineNumber = lineIndex + 1
    const rawLine = lines[lineIndex]
    const parseLine = lineNumber === 1 ? rawLine.replace(/^\uFEFF/, '') : rawLine

    if (/^\s*$/.test(parseLine)) {
      tokens.push({ type: 'blank' })
      lineIndex += 1
      continue
    }

    if (/^\s*#/.test(parseLine)) {
      tokens.push({ type: 'comment', text: rawLine })
      lineIndex += 1
      continue
    }

    const variable = parseVariable(lines, lineIndex, parseLine)
    if (variable === undefined) {
      invalidLines.push({ lineNumber, text: rawLine })
      lineIndex += 1
      continue
    }

    const id = variables.length
    const token = {
      type: 'variable',
      id,
      name: variable.name,
      inlineComment: variable.inlineComment,
    }

    markAttachedComments(tokens, id)
    tokens.push(token)
    variables.push(token)
    lineIndex = variable.nextLineIndex
  }

  if (invalidLines.length > 0) {
    throw new InvalidSourceLineError(invalidLines)
  }

  return {
    tokens,
    variables,
    effectiveVariableIds: findEffectiveVariableIds(variables),
  }
}

function splitSourceLines(sourceText) {
  const normalized = sourceText.replace(/\r\n?/g, '\n')

  if (normalized === '') return []

  const withoutFinalNewline = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized

  return withoutFinalNewline === '' ? [] : withoutFinalNewline.split('\n')
}

function parseVariable(lines, startLineIndex, firstLine) {
  const match = firstLine.match(VARIABLE_DECLARATION_PATTERN)
  if (match === null) return undefined

  const [, name, valueText] = match
  const inlineComment = readInlineComment(lines, startLineIndex, valueText)

  if (inlineComment === undefined) return undefined

  return {
    name,
    inlineComment: inlineComment.comment,
    nextLineIndex: inlineComment.nextLineIndex,
  }
}

function readInlineComment(lines, startLineIndex, valueText) {
  const leadingWhitespace = valueText.match(/^\s*/)?.[0] ?? ''
  const firstValueIndex = leadingWhitespace.length
  const quote = valueText[firstValueIndex]

  if (quote !== '"' && quote !== "'") {
    return {
      comment: findComment(valueText),
      nextLineIndex: startLineIndex + 1,
    }
  }

  let currentLineIndex = startLineIndex
  let searchText = valueText
  let searchStart = firstValueIndex + 1

  while (currentLineIndex < lines.length) {
    const closingQuoteIndex = searchText.indexOf(quote, searchStart)

    if (closingQuoteIndex !== -1) {
      return {
        comment: findComment(searchText.slice(closingQuoteIndex + 1)),
        nextLineIndex: currentLineIndex + 1,
      }
    }

    currentLineIndex += 1
    searchText = lines[currentLineIndex] ?? ''
    searchStart = 0
  }

  return undefined
}

function findComment(text) {
  const commentIndex = text.indexOf('#')
  if (commentIndex === -1) return undefined

  return text.slice(commentIndex).trimEnd()
}

function markAttachedComments(tokens, variableId) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token.type !== 'comment') break

    token.attachedTo = variableId
  }
}

function findEffectiveVariableIds(variables) {
  const lastVariableByName = new Map()

  for (const variable of variables) {
    lastVariableByName.set(variable.name, variable.id)
  }

  return new Set(lastVariableByName.values())
}
