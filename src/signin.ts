import { spawn } from 'node:child_process';
import { baw, BawError, walletStatus } from './baw.js';

/**
 * Sign in to Binance Agentic Wallet.
 *
 * Signing in is two calls — `auth signin` creates a pairing, `auth verify`
 * completes it — and the gap between them is where people get stuck: approve on
 * the phone with nothing running verify and the Binance app reports success
 * while the machine stays signed out. Running both here removes the gap.
 */

type Pairing = {
  status?: string;
  qrCodeId?: string;
  pairingCode?: string;
  urlForWeb?: string;
};

/** Best-effort; a browser that will not open is not a failure worth stopping for. */
function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
      .unref();
  } catch {
    /* the link is printed above regardless */
  }
}

export async function signin(): Promise<number> {
  if ((await walletStatus().catch(() => 'UNKNOWN')) === 'CONNECTED') {
    console.log('\n  Already signed in.\n');
    return 0;
  }

  const pairing = await baw<Pairing>(['auth', 'signin']);
  if (pairing.status === 'ALREADY_CONNECTED') {
    console.log('\n  Already signed in.\n');
    return 0;
  }

  const { qrCodeId, pairingCode, urlForWeb } = pairing;
  if (!qrCodeId || !urlForWeb) {
    console.error('\n  Sign-in did not return a pairing. Try `baw auth signin --json` directly.\n');
    return 1;
  }

  console.log(`\n  PAIRING CODE:  ${pairingCode ?? '—'}\n`);
  console.log('  Open this on your phone, or scan the QR it shows:');
  console.log(`  ${urlForWeb}\n`);
  console.log('  Check the code in the Binance app matches before you approve.');
  console.log('  Waiting — leave this running until it returns.\n');
  openInBrowser(urlForWeb);

  try {
    await baw(['auth', 'verify', '--qrCodeId', qrCodeId]);
  } catch (err) {
    const msg = (err as BawError).message ?? String(err);
    // The pairing window is about five minutes; an expired code needs a new one,
    // not a retry of the old id.
    if (/AUTH_REJECTED|expired|does not exist/i.test(msg)) {
      console.error('\n  That code expired before it was approved. Run `open-doors signin` again.\n');
      return 1;
    }
    console.error(`\n  ${msg}\n`);
    return 1;
  }

  // The app screen is not the source of truth; the wallet is.
  const status = await walletStatus().catch(() => 'UNKNOWN');
  if (status === 'CONNECTED') {
    console.log('\n  Signed in. Run `open-doors` to scan your wallet.\n');
    return 0;
  }
  console.error(`\n  The app confirmed but the wallet still reports ${status}.\n` +
                '  Run `open-doors signin` again for a fresh code.\n');
  return 1;
}
