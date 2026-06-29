import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';

/** Narrow an unknown error to a Node.js system error so its `code` can be read. */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Stat a path, returning `undefined` when nothing exists there.
 *
 * Only a missing path (`ENOENT`) maps to `undefined`; every other failure
 * (permissions, I/O) propagates so callers never mistake a real error for
 * absence.
 */
export async function statOptional(path: string): Promise<Stats | undefined> {
  try {
    return await stat(path);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}
