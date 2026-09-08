import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Approval } from './types.js';

/**
 * Short-lived cache of the last scan.
 *
 * Reading the wallet takes several seconds, and `explain` was paying that cost
 * again to describe a row the user had just been shown. Reads reuse a recent
 * scan; anything that changes state does not, because acting on stale approval
 * data is exactly the mistake this tool exists to prevent.
 */

const TTL_MS = 60_000;
const FILE = join(tmpdir(), 'open-doors-scan.json');

type Cached = { at: number; approvals: Approval[]; portfolioUsd: number };

export async function readCache(): Promise<Cached | null> {
  try {
    const raw = JSON.parse(await readFile(FILE, 'utf8')) as Cached;
    if (!raw?.at || Date.now() - raw.at > TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function writeCache(approvals: Approval[], portfolioUsd: number): Promise<void> {
  try {
    await mkdir(tmpdir(), { recursive: true });
    await writeFile(FILE, JSON.stringify({ at: Date.now(), approvals, portfolioUsd }));
  } catch {
    // a cache that cannot be written is not an error worth surfacing
  }
}

export function ageSeconds(at: number): number {
  return Math.max(0, Math.round((Date.now() - at) / 1000));
}
