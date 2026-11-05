import { deriveRecapView, recapPosterUrl, siteOf, type RecapInputs } from './view';

const card = {
  title_id: 7,
  title: 'Paddington 2',
  year: 2017,
  runtime_min: 103,
  poster_path: '/p.jpg',
  poster_placeholder: 'hash',
  providers: [],
  watch_link: null,
};

function inputs(overrides: Partial<RecapInputs> = {}): RecapInputs {
  return {
    room: {
      data: {
        state: 'done',
        mode: 'quick_match',
        started_at: '2026-11-05T20:00:00Z',
        decided_at: '2026-11-05T20:03:42Z',
      },
      isError: false,
    },
    seats: { data: [{ swipe_count: 14 }, { swipe_count: 0 }, { swipe_count: 27 }], isError: false },
    winner: { status: 'ready', card, onlyFilm: false } as unknown as RecapInputs['winner'],
    online: true,
    imageBase: 'https://image.tmdb.org/t/p',
    inviteBase: 'https://flimme.com/',
    retry: jest.fn(),
    ...overrides,
  };
}

describe('the recap view (recap.md#states)', () => {
  it('is ready with the pick, the numbers and the site', () => {
    expect(deriveRecapView(inputs())).toEqual({
      status: 'ready',
      title: 'Paddington 2',
      posterUri: 'https://image.tmdb.org/t/p/w342/p.jpg',
      thumbhash: 'hash',
      seconds: 222,
      people: 2,
      swipes: 41,
      site: 'flimme.com',
    });
  });

  it('has no poster uri when the film has none', () => {
    const view = deriveRecapView(
      inputs({
        winner: {
          status: 'ready',
          card: { ...card, poster_path: null },
        } as unknown as RecapInputs['winner'],
      }),
    );
    expect(view).toMatchObject({ status: 'ready', posterUri: null });
  });

  it('closes for a room that is not done, a solo room, or no pick', () => {
    const base = inputs();
    const room = (patch: object) => ({ ...base.room, data: { ...base.room.data!, ...patch } });
    expect(deriveRecapView(inputs({ room: room({ state: 'swiping' }) })).status).toBe('closed');
    expect(deriveRecapView(inputs({ room: room({ mode: 'solo' }) })).status).toBe('closed');
    expect(
      deriveRecapView(inputs({ winner: { status: 'no_pick' } as unknown as RecapInputs['winner'] }))
        .status,
    ).toBe('closed');
    expect(deriveRecapView(inputs({ room: { data: null, isError: false } })).status).toBe('closed');
  });

  it('loads while the reads are on their way', () => {
    expect(
      deriveRecapView(
        inputs({
          room: { data: undefined, isError: false },
          winner: { status: 'loading' } as unknown as RecapInputs['winner'],
        }),
      ).status,
    ).toBe('loading');
    expect(deriveRecapView(inputs({ seats: { data: undefined, isError: false } })).status).toBe(
      'loading',
    );
  });

  it('is offline when the reads have not come and the phone is offline', () => {
    expect(
      deriveRecapView(inputs({ online: false, room: { data: undefined, isError: false } })).status,
    ).toBe('offline');
  });

  it('shows a failed read with a retry', () => {
    const retry = jest.fn();
    const view = deriveRecapView(inputs({ room: { data: undefined, isError: true }, retry }));
    expect(view.status).toBe('error');
    if (view.status === 'error') view.retry();
    expect(retry).toHaveBeenCalled();
    expect(
      deriveRecapView(
        inputs({
          winner: { status: 'error', retry: jest.fn() } as unknown as RecapInputs['winner'],
        }),
      ).status,
    ).toBe('error');
  });

  it('leaves the time out when the room has no dates', () => {
    const base = inputs();
    const view = deriveRecapView(
      inputs({
        room: { ...base.room, data: { ...base.room.data!, started_at: null } },
      }),
    );
    expect(view).toMatchObject({ status: 'ready', seconds: null });
  });
});

describe('the site and the poster', () => {
  it('prints the invite link host, flimme.com by default', () => {
    expect(siteOf('https://flimme.com/')).toBe('flimme.com');
    expect(siteOf(undefined)).toBe('flimme.com');
    expect(siteOf('not a url')).toBe('flimme.com');
  });

  it('asks TMDB for w342', () => {
    expect(recapPosterUrl('https://image.tmdb.org/t/p/', '/x.jpg')).toBe(
      'https://image.tmdb.org/t/p/w342/x.jpg',
    );
    expect(recapPosterUrl(undefined, '/x.jpg')).toBeNull();
    expect(recapPosterUrl('https://image.tmdb.org/t/p', null)).toBeNull();
  });
});
