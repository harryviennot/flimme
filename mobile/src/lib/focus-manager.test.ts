import { focusManager } from '@tanstack/react-query';

import { watchAppFocus } from './focus-manager';

describe('watchAppFocus', () => {
  it('follows AppState: active is focused, anything else is not', () => {
    let listener: (status: string) => void = () => {};
    const remove = jest.fn();
    watchAppFocus({
      addEventListener: (_type: 'change', fn: (status: never) => void) => {
        listener = fn as (status: string) => void;
        return { remove };
      },
    } as never);

    listener('background');
    expect(focusManager.isFocused()).toBe(false);
    listener('active');
    expect(focusManager.isFocused()).toBe(true);
  });
});
