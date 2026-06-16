import type { EnvEntry, EnvNode } from './types';

export const emptyEntries = Object.freeze([]) as readonly EnvEntry[];

export function freezeNode<TNode extends EnvNode>(node: TNode): TNode {
  Object.freeze(node.lineRange);
  return Object.freeze(node);
}

export function createKeyIndex(
  nodes: readonly EnvNode[],
): Readonly<Record<string, readonly EnvEntry[]>> {
  const mutableIndex: Record<string, EnvEntry[]> = Object.create(null) as Record<
    string,
    EnvEntry[]
  >;

  for (const node of nodes) {
    if (node.type !== 'entry') {
      continue;
    }

    const entries = mutableIndex[node.key] ?? [];
    entries.push(node);
    mutableIndex[node.key] = entries;
  }

  for (const key of Object.keys(mutableIndex)) {
    Object.freeze(mutableIndex[key]);
  }

  return Object.freeze(mutableIndex);
}
