/**
 * Renders a Parsed Environment Document as an Example Environment File projection.
 *
 * Only Effective Variables are emitted, and every emitted variable is written as
 * a Blank Assignment so source values cannot cross into the Sync Target.
 */
export function renderExampleEnvironmentFile(document) {
  const lines = []

  for (const token of document.tokens) {
    if (token.type === 'blank') {
      lines.push('')
      continue
    }

    if (token.type === 'comment') {
      if (token.attachedTo === undefined || document.effectiveVariableIds.has(token.attachedTo)) {
        lines.push(token.text)
      }
      continue
    }

    if (document.effectiveVariableIds.has(token.id)) {
      lines.push(renderBlankAssignment(token))
    }
  }

  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

function renderBlankAssignment(variable) {
  if (variable.inlineComment === undefined) return `${variable.name}=`

  return `${variable.name}= ${variable.inlineComment.trimStart()}`
}
