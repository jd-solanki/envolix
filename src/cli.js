import { runSync, syncHelpText } from './commands/sync.js'

export const topLevelHelpText = `Usage:
  envolix [command] [options]

Commands:
  sync [source] [target]  Project a Source Environment File to a file-based Sync Target

Options:
  -h, --help             Show help

Examples:
  envolix sync
  envolix sync .env .env.example
`

/**
 * Runs the envolix command line interface against already-tokenized arguments.
 *
 * stdout/stderr are writable streams so tests can exercise the same command seam
 * as the executable without mutating process-wide IO.
 */
export async function runCli(args, { stdout, stderr }) {
  const [command, ...rest] = args

  if (command === undefined || command === '-h' || command === '--help') {
    stdout.write(topLevelHelpText)
    return 0
  }

  if (isOption(command)) {
    stderr.write(`Unsupported option: ${command}\n\n${topLevelHelpText}`)
    return 1
  }

  if (command === 'sync') {
    return runSync(rest, { stdout, stderr })
  }

  stderr.write(`Unknown command: ${command}\n\n${topLevelHelpText}`)
  return 1
}

export { syncHelpText }

function isOption(arg) {
  return arg.startsWith('-') && arg !== '-'
}
