import { registerDevMenu } from './dev-menu';

const mockRegister = jest.fn(async () => undefined);
jest.mock('expo-dev-client', () => ({
  registerDevMenuItems: (...args: unknown[]) =>
    (mockRegister as (...a: unknown[]) => Promise<void>)(...args),
}));

describe('the Expo dev menu item', () => {
  beforeEach(() => mockRegister.mockClear());

  it('registers one item that opens the app dev menu', async () => {
    const open = jest.fn();
    await registerDevMenu(open, true);
    expect(mockRegister).toHaveBeenCalledTimes(1);
    const [items] = mockRegister.mock.calls[0] as unknown as [
      { name: string; callback: () => void; shouldCollapse?: boolean }[],
    ];
    expect(items).toHaveLength(1);
    expect(items[0]?.shouldCollapse).toBe(true);
    items[0]?.callback();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('registers nothing outside development builds', async () => {
    await registerDevMenu(jest.fn(), false);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('survives a client without the dev menu', async () => {
    mockRegister.mockRejectedValueOnce(new Error('no native module'));
    await expect(registerDevMenu(jest.fn(), true)).resolves.toBeUndefined();
  });
});
