import { Command } from 'commander';
import pc from 'picocolors';
import { formatDiagnostic } from '../lib/diagnostic-format';
import { GenWorkflowDiagnosticError, GenWorkflowError, runGenWorkflow } from '../lib/gen-workflow';
import { SourceEnvFileError } from '../lib/source-env-file';

interface GenOptions {
  readonly source: string;
  readonly target: string;
  readonly preserve: boolean;
  readonly stage?: boolean;
}

export const genCommand = new Command('gen')
  .description('Generate an example env file with private values removed.')
  .option('-s, --source <path>', 'source env file', '.env')
  .option('-t, --target <path>', 'target env file', '.env.example')
  .option('--no-preserve', 'blank every value instead of keeping existing #varType:plain values')
  .option('-S, --stage', 'stage the generated file with git add')
  .action(async (options: GenOptions) => {
    try {
      const { warnings } = await runGenWorkflow({
        cwd: process.cwd(),
        source: options.source,
        target: options.target,
        preserve: options.preserve,
        stage: Boolean(options.stage),
      });
      for (const warning of warnings) {
        console.warn(pc.yellow(`Warning: ${warning}`));
      }
      console.log(pc.green(`Generated ${options.target} from ${options.source}`));
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function printError(error: unknown): void {
  if (error instanceof GenWorkflowDiagnosticError) {
    console.error(pc.red('Error: ') + error.message);
    for (const diagnostic of error.diagnostics) {
      console.error(formatDiagnostic(error.sourcePath, diagnostic));
    }
    return;
  }

  if (error instanceof GenWorkflowError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  if (error instanceof SourceEnvFileError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red('Error: ') + message);
}
