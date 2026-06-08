import { readFile, writeFile } from 'node:fs/promises'
import { parseEnvironmentDocument } from './parser.js'
import { renderExampleEnvironmentFile } from './renderer.js'

export class SyncFileError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'SyncFileError'
  }
}

/**
 * Projects one Source Environment File into one file-based Sync Target.
 *
 * The target is fully rewritten only after the source has been read and parsed,
 * which keeps existing target content intact when Invalid Source Lines are found.
 */
export async function syncEnvironmentFiles({ source, target }) {
  const sourceText = await readSourceEnvironmentFile(source)
  const document = parseEnvironmentDocument(sourceText)
  const rendered = renderExampleEnvironmentFile(document)

  await writeSyncTarget(target, rendered)

  return {
    blankAssignmentCount: document.effectiveVariableIds.size,
  }
}

async function readSourceEnvironmentFile(source) {
  try {
    return await readFile(source, 'utf8')
  } catch (error) {
    throw new SyncFileError(
      `Could not read Source Environment File "${source}": ${formatFileError(error)}`,
      { cause: error },
    )
  }
}

async function writeSyncTarget(target, rendered) {
  try {
    await writeFile(target, rendered, 'utf8')
  } catch (error) {
    throw new SyncFileError(
      `Could not write Sync Target "${target}": ${formatFileError(error)}`,
      { cause: error },
    )
  }
}

function formatFileError(error) {
  if (error?.code === 'ENOENT') {
    return 'the file or parent directory does not exist'
  }

  if (error?.code === 'EISDIR') {
    return 'the path is a directory'
  }

  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return 'permission denied'
  }

  return error?.message ?? 'unknown filesystem error'
}
