import { initialSelection, selectionChanged, toRoomSettings } from './settings';

describe('toRoomSettings', () => {
  it('defaults to no limit on either key', () => {
    expect(toRoomSettings('any', 'adults')).toEqual({ runtime_max: null, max_age: null });
  });

  it('maps the choices to the room settings', () => {
    expect(toRoomSettings('under105', '12')).toEqual({ runtime_max: 105, max_age: 12 });
    expect(toRoomSettings('under120', 'all')).toEqual({ runtime_max: 120, max_age: 0 });
    expect(toRoomSettings('any', '16').max_age).toBe(16);
    expect(toRoomSettings('any', '10').max_age).toBe(10);
  });
});

describe('initialSelection', () => {
  it('keeps only the saved ids the country lists', () => {
    expect(initialSelection([8, 999], [8, 119])).toEqual([8]);
  });

  it('is empty when nothing is saved', () => {
    expect(initialSelection([], [8, 119])).toEqual([]);
  });
});

describe('selectionChanged', () => {
  it('ignores order', () => {
    expect(selectionChanged([8, 119], [119, 8])).toBe(false);
  });

  it('sees an added or a removed id', () => {
    expect(selectionChanged([8], [8, 119])).toBe(true);
    expect(selectionChanged([8, 119], [8])).toBe(true);
    expect(selectionChanged([8], [119])).toBe(true);
  });
});
