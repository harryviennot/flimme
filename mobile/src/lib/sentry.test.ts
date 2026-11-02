import * as Sentry from '@sentry/react-native';

import { initSentry, reportError, sentryOptions } from './sentry';
import { scrubBreadcrumb } from './sentry-scrub';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: jest.fn((component: unknown) => component),
}));

const DSN = { EXPO_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2' };

describe('sentryOptions', () => {
  it('is off without a DSN', () => {
    expect(sentryOptions({}, 'development').enabled).toBe(false);
    expect(sentryOptions({ EXPO_PUBLIC_SENTRY_DSN: '  ' }, 'development').enabled).toBe(false);
  });

  it('is on with a DSN, named after the variant, and sends no personal data', () => {
    const options = sentryOptions(DSN, 'preview');
    expect(options.enabled).toBe(true);
    expect(options.environment).toBe('preview');
    expect(options.sendDefaultPii).toBe(false);
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it('sends errors only: no tracing, no logs, no screenshots', () => {
    const options = sentryOptions(DSN, 'production');
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.enableLogs).toBeFalsy();
    expect(options.attachScreenshot).toBeFalsy();
    expect(options.attachViewHierarchy).toBeFalsy();
  });

  it('removes the user from an event on the way out', async () => {
    const options = sentryOptions(DSN, 'preview');
    const sent = await options.beforeSend?.({ user: { ip_address: '1.2.3.4' } }, {});
    expect(sent).not.toHaveProperty('user');
  });
});

describe('initSentry and reportError', () => {
  it('starts the SDK once, disabled when there is no DSN', () => {
    initSentry();
    initSentry();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect((Sentry.init as jest.Mock).mock.calls[0][0].enabled).toBe(false);
  });

  it('sends an error to Sentry', () => {
    const error = new Error('boom');
    reportError(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
