import { digitsOf, parseInviteLink, readPasted, roomRouteFor } from './link';

const REF = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';

describe('digitsOf', () => {
  it('keeps the digits, at most six', () => {
    expect(digitsOf('482 913')).toBe('482913');
    expect(digitsOf('code: 4829137')).toBe('482913');
    expect(digitsOf('abc')).toBe('');
  });
});

describe('parseInviteLink', () => {
  it('gives the code and the reference', () => {
    expect(parseInviteLink(`https://x.y/join/482913?r=${REF}`)).toEqual({
      code: '482913',
      ref: REF,
    });
  });

  it("reads a development build's scheme link, where join is the host", () => {
    expect(parseInviteLink(`flimme-dev://join/482913?r=${REF}`)).toEqual({
      code: '482913',
      ref: REF,
    });
    expect(parseInviteLink('flimme-preview://join/482913')).toEqual({ code: '482913' });
    expect(parseInviteLink('flimme-dev://join/48291')).toBeNull();
    expect(parseInviteLink('flimme-dev://other/482913')).toBeNull();
    expect(parseInviteLink('flimme-dev://join/482913?r=nope')).toBeNull();
  });

  it('gives the code alone when there is no reference', () => {
    expect(parseInviteLink('https://flimme.app/join/482913')).toEqual({ code: '482913' });
    expect(parseInviteLink('/join/482913/')).toEqual({ code: '482913' });
  });

  it('ignores the host, the scheme and the other parameters', () => {
    expect(
      parseInviteLink(`  http://evil.example:8080/join/482913?utm=1&r=${REF}&x=2#top `),
    ).toEqual({ code: '482913', ref: REF });
    expect(parseInviteLink(`flimme://anything/join/482913?r=${REF}`)).toEqual({
      code: '482913',
      ref: REF,
    });
  });

  it('refuses what is not a strict link', () => {
    expect(parseInviteLink('https://x.y/join/482913?r=not-a-uuid')).toBeNull();
    expect(parseInviteLink('https://x.y/join/48291')).toBeNull();
    expect(parseInviteLink('https://x.y/join/4829133')).toBeNull();
    expect(parseInviteLink('https://x.y/room/482913')).toBeNull();
    expect(parseInviteLink('482913')).toBeNull();
    expect(parseInviteLink(`hello https://x.y/join/482913?r=${REF}`)).toBeNull();
  });
});

describe('readPasted', () => {
  it('reads a link, else keeps the digits', () => {
    expect(readPasted(`https://x.y/join/482913?r=${REF}`)).toEqual({ code: '482913', ref: REF });
    expect(readPasted('Mon code : 482 913')).toEqual({ code: '482913' });
  });
});

describe('roomRouteFor', () => {
  it('routes by state', () => {
    expect(roomRouteFor('r1', 'lobby')).toBe('/room/r1/lobby');
    expect(roomRouteFor('r1', 'dealing')).toBe('/room/r1/lobby');
    expect(roomRouteFor('r1', 'swiping')).toBe('/room/r1/swipe');
    expect(roomRouteFor('r1', 'finale')).toBe('/room/r1/final-cut');
    expect(roomRouteFor('r1', 'done')).toBe('/room/r1/winner');
    expect(roomRouteFor('r1', 'abandoned')).toBe('/room/r1/closed');
  });
});
