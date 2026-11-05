import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hideToast, showToast, ToastHost } from './toast';

const frame = { x: 0, y: 0, width: 375, height: 667 };
const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame, insets }}>
      <ToastHost />
    </SafeAreaProvider>,
  );

describe('Toast', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await act(async () => hideToast());
    jest.useRealTimers();
  });

  it('stays for its duration, then calls onDismiss once', async () => {
    const onDismiss = jest.fn();
    await mount();
    await act(async () => showToast({ title: 'Removed', duration: 5000, onDismiss }));
    expect(screen.getByText('Removed')).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(4900));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(200));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed')).toBeNull();
  });

  it('runs the action, closes, and never calls onDismiss', async () => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    await mount();
    await act(async () =>
      showToast({ title: 'Removed', action: { label: 'Undo', onPress }, onDismiss }),
    );
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Undo' })));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed')).toBeNull();
    await act(async () => void jest.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('counts a toast replaced by a newer one as closed', async () => {
    const first = jest.fn();
    await mount();
    await act(async () => showToast({ title: 'One', onDismiss: first }));
    await act(async () => showToast({ title: 'Two' }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Two')).toBeTruthy();
  });
});
