import { getFixedT } from 'i18next';

import '@/i18n';

import { displayLink, inviteLink, shareMessage } from './invite-link';

jest.mock('@/api', () => ({ api: {} }));
jest.mock('@/features/session', () => ({ startSession: jest.fn() }));

const ID = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';

describe('inviteLink', () => {
  it('uses the invite base, with or without a trailing slash', () => {
    for (const base of ['https://flimme.app', 'https://flimme.app/']) {
      expect(inviteLink({ base, scheme: 'flimme-dev', code: '482913', id: ID })).toBe(
        `https://flimme.app/join/482913?r=${ID}`,
      );
    }
  });

  it("falls back to the build's scheme", () => {
    expect(inviteLink({ scheme: 'flimme-dev', code: '482913', id: ID })).toBe(
      `flimme-dev://join/482913?r=${ID}`,
    );
  });
});

describe('displayLink', () => {
  it('drops https:// and keeps a scheme link whole', () => {
    expect(displayLink('https://flimme.app/join/482913')).toBe('flimme.app/join/482913');
    expect(displayLink('flimme-dev://join/482913')).toBe('flimme-dev://join/482913');
  });
});

describe('shareMessage', () => {
  it('reads in both languages with the code spaced', () => {
    const en = getFixedT('en', 'lobby');
    const fr = getFixedT('fr', 'lobby');
    expect(shareMessage(en, 'L', '482913')).toBe('Join my room: L (code 482 913)');
    expect(shareMessage(fr, 'L', '482913')).toBe('Rejoins ma salle : L (code 482 913)');
  });
});
