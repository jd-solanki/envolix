import { GitHubProvider } from './github';
import type { Provider, ProviderTarget } from './index';

export type ProviderName = 'github';

interface ProviderTargetLabelInput {
  readonly target: ProviderTarget;
}

const providerNames = Object.freeze(['github'] as const satisfies readonly ProviderName[]);

export function parseProviderName(value: string): ProviderName | undefined {
  return isProviderName(value) ? value : undefined;
}

export function formatSupportedProviderNames(): string {
  return providerNames.join(', ');
}

export function createProvider(providerName: ProviderName): Provider {
  switch (providerName) {
    case 'github':
      return new GitHubProvider();
  }
}

export function formatProviderTarget(
  providerName: ProviderName,
  targeted: ProviderTargetLabelInput,
): string {
  switch (providerName) {
    case 'github':
      return formatGitHubTarget(targeted.target);
  }
}

function isProviderName(value: string): value is ProviderName {
  return providerNames.includes(value as ProviderName);
}

function formatGitHubTarget(target: ProviderTarget): string {
  const scope =
    target.environment === undefined
      ? 'GitHub Actions repository scope'
      : `GitHub Environment: ${target.environment}`;

  return target.repo === undefined ? scope : `${scope} in ${target.repo}`;
}
