import i18n from './index';

describe('translations', () => {
  it('answers in French and English, with plurals', () => {
    expect(i18n.t('answers.like', { lng: 'fr' })).toBe("J'aime");
    expect(i18n.t('answers.like', { lng: 'en' })).toBe('Like');
    expect(i18n.t('states.offlineVotes', { lng: 'en', count: 1 })).toBe('Offline: 1 swipe waiting');
    expect(i18n.t('states.offlineVotes', { lng: 'fr', count: 6 })).toBe(
      'Hors ligne : 6 votes en attente',
    );
  });
});
