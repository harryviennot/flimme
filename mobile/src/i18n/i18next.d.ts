import 'i18next';

import type { resources } from './resources';

// Typed keys: t('common:actions.retry') is checked against the French file.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['fr'];
    returnNull: false;
  }
}
