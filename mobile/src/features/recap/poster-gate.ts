/** How long a capture waits for the poster before it settles for the placeholder. */
export const POSTER_WAIT_MS = 3000;

export type PosterGate = {
  /** The poster loaded, or failed to: either way there is nothing more to wait for. */
  markLoaded: () => void;
  /** Resolves when the poster is in, or after `POSTER_WAIT_MS`. Never rejects. */
  wait: () => Promise<void>;
};

/** What the capture waits on, so the image never shows a half-loaded poster (recap.md#sharing). */
export function createPosterGate(hasPoster: boolean): PosterGate {
  let loaded = !hasPoster;
  const waiters: (() => void)[] = [];
  return {
    markLoaded() {
      loaded = true;
      for (const resolve of waiters.splice(0)) resolve();
    },
    wait() {
      if (loaded) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, POSTER_WAIT_MS);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
