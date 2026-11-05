import i18n from '@/i18n';

import { formatRecapTime } from './time';

describe.each(['fr', 'en'] as const)('the recap time in %s (Q21.7)', (language) => {
  it.each([
    [222, '3 min 42 s'],
    [48, '48 s'],
    [240, '4 min'],
    [3900, '1 h 5 min'],
    [3600, '1 h 0 min'],
    [59, '59 s'],
    [60, '1 min'],
    [0, '0 s'],
  ])('%i seconds is %s', async (seconds, text) => {
    await i18n.changeLanguage(language);
    expect(formatRecapTime(seconds, i18n.getFixedT(language, 'recap'), language)).toBe(text);
  });
});
