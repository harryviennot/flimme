import { homeExit } from './exit-home';

describe('homeExit', () => {
  it('goes back to a Home that is in the stack', () => {
    expect(homeExit([{ name: 'index' }, { name: '(tabs)' }, { name: 'room/[id]' }])).toBe(
      'dismissTo',
    );
  });

  it('finds a Home inside the router wrapper', () => {
    expect(
      homeExit([{ name: '__root', state: { routes: [{ name: 'play' }, { name: 'room/[id]' }] } }]),
    ).toBe('dismissTo');
  });

  it('replaces the room when no Home is open', () => {
    expect(homeExit([{ name: 'index' }, { name: 'room/[id]' }])).toBe('replace');
    expect(homeExit([{ name: 'room/[id]' }])).toBe('replace');
  });
});
