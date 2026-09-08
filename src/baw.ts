import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Thin wrapper around the Binance Agentic Wallet CLI.
 *
 * Two rules, both from the skill's own policy and both worth keeping:
 *   - every call passes --json
 *   - CLI errors are surfaced verbatim, never reworded or guessed at
 */

export class BawError extends Error {
  constructor(readonly args: string[], readonly raw: string) {
    super(raw.trim() || `baw ${args.join(' ')} failed with no output`);
    this.name = 'BawError';
  }
}

export class BawMissing extends Error {
  constructor() {
    super(
      'The `baw` CLI was not found.\n' +
        'Install it with:\n' +
        '  npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet\n' +
        'Then sign in by asking your agent: "Sign in to Binance Agentic Wallet".',
    );
    this.name = 'BawMissing';
  }
}

export type BawEnvelope<T> = { success: boolean; data: T; message?: string };

export async function baw<T>(args: string[]): Promise<T> {
  const full = [...args, '--json'];
  let stdout: string;
  try {
    ({ stdout } = await exec('baw', full, { maxBuffer: 32 * 1024 * 1024 }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (e.code === 'ENOENT') throw new BawMissing();
    // baw reports failures as JSON on stdout in most cases; prefer that over stderr.
    const raw = (e.stdout || '').trim() || (e.stderr || '').trim() || String(e.message);
    throw new BawError(full, raw);
  }

  let parsed: BawEnvelope<T>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new BawError(full, `expected JSON, got:\n${stdout.slice(0, 400)}`);
  }

  if (parsed.success === false) throw new BawError(full, parsed.message ?? stdout);
  return parsed.data;
}

export async function isSignedIn(): Promise<boolean> {
  try {
    const status = await baw<Record<string, unknown>>(['wallet', 'status']);
    return Boolean(status && (status.connected ?? status.signedIn ?? true));
  } catch (err) {
    if (err instanceof BawMissing) throw err;
    return false;
  }
}
