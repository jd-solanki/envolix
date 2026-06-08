import { InvalidSourceLineError } from '../env/parser.js'
import { SyncFileError, syncEnvironmentFiles } from '../env/sync.js'

export const DEFAULT_SOURCE_ENVIRONMENT_FILE = '.env'
export const DEFAULT_SYNC_TARGET = '.env.example'

export const syncHelpText = `Usage:
  envolix sync [source] [target] [options]

Description:
  Project one Source Environment File to one file-based Sync Target.
  Source values are omitted from the Example Environment File as Blank Assignments.

Arguments:
  source                 Source Environment File (default: .env)
  target                 File-based Sync Target / Example Environment File (default: .env.example)

Options:
  -h, --help             Show help

Examples:
  envolix sync
  envolix sync .env .env.example
`

export async function runSync(args, { stdout, stderr }) {
  if (args.includes('-h') || args.includes('--help')) {
    stdout.write(syncHelpText)
    return 0
  }

  const unsupportedOption = args.find(isOption)
  if (unsupportedOption !== undefined) {
    stderr.write(`Unsupported option: ${unsupportedOption}\n\n${syncHelpText}`)
    return 1
  }

  if (args.length > 2) {
    stderr.write(`Unexpected argument: ${args[2]}\n\n${syncHelpText}`)
    return 1
  }

  const source = args[0] ?? DEFAULT_SOURCE_ENVIRONMENT_FILE
  const target = args[1] ?? DEFAULT_SYNC_TARGET

  try {
    const result = await syncEnvironmentFiles({ source, target })

    stdout.write(
      [
        `Synced Source Environment File "${source}" to Sync Target "${target}".`,
        `Rendered ${formatBlankAssignmentCount(result.blankAssignmentCount)}.`,
        '',
      ].join('\n'),
    )

    return 0
  } catch (error) {
    if (error instanceof InvalidSourceLineError || error instanceof SyncFileError) {
      stderr.write(`${error.message}\n`)
      return 1
    }

    throw error
  }
}

function formatBlankAssignmentCount(count) {
  return `${count} Blank Assignment${count === 1 ? '' : 's'}`
}

function isOption(arg) {
  return arg.startsWith('-') && arg !== '-'
}
