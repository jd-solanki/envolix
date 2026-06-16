import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import { GitHubProvider } from '../lib/provider/github.js';
import type { Provider } from '../lib/provider/index.js';
import { PullWorkflowError, executePull, planPull, type PullResult } from '../lib/pull/index.js';

interface PullOptions {
  readonly provider: 'github';
  readonly environment?: string;
}

export const pullCommand = new Command('pull')
  .description('Pull provider env values into a new local env file.')
  .requiredOption('-p, --provider <name>', 'provider to pull from (github)', parseProvider)
  .option('-e, --environment <name>', 'GitHub Environment to pull from')
  .action(async (options: PullOptions) => {
    try {
      const provider = createProvider(options.provider);
      const plan = await planPull({
        cwd: process.cwd(),
        providerName: options.provider,
        provider,
        ...(options.environment === undefined ? {} : { environment: options.environment }),
      });
      const result = await executePull(plan);
      printResult(result);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

function parseProvider(value: string): PullOptions['provider'] {
  if (value === 'github') {
    return value;
  }

  throw new InvalidArgumentError(`Unsupported provider "${value}". Supported providers: github.`);
}

function createProvider(provider: PullOptions['provider']): Provider {
  switch (provider) {
    case 'github':
      return new GitHubProvider();
  }
}

function printResult(result: PullResult): void {
  console.log(pc.green(`Pulled ${formatTarget(result)} to ${result.fileName}`));

  if (result.blankSecretKeys.length > 0) {
    console.log('Blank remote secrets:');
    for (const key of result.blankSecretKeys) {
      console.log(`  ${key}`);
    }
  }

  if (!result.isGitIgnored) {
    console.warn(
      pc.yellow(`Warning: ${result.fileName} is not gitignored. Do not commit pulled env values.`),
    );
  }
}

function formatTarget(targeted: Pick<PullResult, 'target'>): string {
  return targeted.target.environment === undefined
    ? 'GitHub Actions repository scope'
    : `GitHub Environment ${targeted.target.environment}`;
}

function printError(error: unknown): void {
  if (error instanceof PullWorkflowError) {
    console.error(pc.red('Error: ') + error.message);
    for (const detail of error.details) {
      console.error(pc.dim(detail));
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red('Error: ') + message);
}
