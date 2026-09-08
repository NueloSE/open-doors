/**
 * Progress feedback while the wallet is being read.
 *
 * A scan takes several seconds of network calls. Without this the terminal sits
 * blank and the tool looks hung — the one moment a security tool should not
 * feel uncertain.
 *
 * Everything is written to stderr so stdout stays clean for `--json`, and it
 * only draws when stderr is a TTY, so pipes and CI logs are unaffected.
 */

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export type Progress = {
  step: (label: string) => void;
  done: () => void;
};

const noop: Progress = { step: () => {}, done: () => {} };

export function progress(enabled = true): Progress {
  if (!enabled || !process.stderr.isTTY || process.env.NO_COLOR) return noop;

  let frame = 0;
  let label = '';
  let timer: NodeJS.Timeout | undefined;

  const clear = () => process.stderr.write('\r\x1b[2K');
  const draw = () => {
    clear();
    process.stderr.write(`\x1b[2m${FRAMES[frame % FRAMES.length]} ${label}\x1b[0m`);
    frame++;
  };

  return {
    step(next: string) {
      label = next;
      if (!timer) {
        draw();
        timer = setInterval(draw, INTERVAL_MS);
        timer.unref?.();
      }
    },
    done() {
      if (timer) clearInterval(timer);
      timer = undefined;
      clear();
    },
  };
}
