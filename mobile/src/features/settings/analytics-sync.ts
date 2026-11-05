import type { AnalyticsChoice, SetAnalyticsChoiceResult } from '@flimme/contract';

import type { createSettingsStore } from './store';

/**
 * The wording version of the analytics copy (`settings:analytics.*`), sent with every choice so
 * the server knows which text the player agreed to. Bump it whenever that copy changes.
 */
export const ANALYTICS_WORDING_VERSION = '2026-11-analytics-1';

type Deps = {
  store: ReturnType<typeof createSettingsStore>;
  send: (args: { choice: AnalyticsChoice; version: string }) => Promise<SetAnalyticsChoiceResult>;
  /** An answer that means a bug (`invalid`): its status only. */
  report: (error: Error) => void;
};

/**
 * Sends the stored analytics choice to the server when it differs from the last one the server
 * confirmed (settings.md, "Help improve the app"). Calls made while one runs share it, and the
 * run looks again when it answers, so quick taps send the latest value only. A failure or
 * `rate_limited` leaves the difference in place: the next launch sends it.
 */
export function createAnalyticsSync({ store, send, report }: Deps) {
  let running: Promise<void> | undefined;

  async function run(): Promise<void> {
    for (;;) {
      const { analyticsChoice: choice, analyticsSynced } = store.getState();
      if (choice === analyticsSynced) return;
      let result: SetAnalyticsChoiceResult;
      try {
        result = await send({ choice, version: ANALYTICS_WORDING_VERSION });
      } catch {
        return;
      }
      if (result.status === 'invalid') {
        report(new Error('set_analytics_choice: invalid'));
        return;
      }
      if (result.status === 'rate_limited') return;
      store.getState().markAnalyticsSynced(choice);
    }
  }

  return {
    sync(): Promise<void> {
      running ??= run().finally(() => {
        running = undefined;
      });
      return running;
    },
  };
}
