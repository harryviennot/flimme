import { fireEvent, render, screen } from '@testing-library/react-native';

import { playSound } from '@/lib/sound';

import { Pressable } from './pressable';

jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));

beforeEach(() => jest.mocked(playSound).mockClear());

describe('Pressable tick', () => {
  it('ticks on press-in by default', async () => {
    await render(<Pressable accessibilityLabel="Go" />);
    await fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressIn');
    expect(playSound).toHaveBeenCalledWith('tap');
  });

  it('stays silent when disabled', async () => {
    await render(<Pressable accessibilityLabel="Go" disabled />);
    await fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressIn');
    expect(playSound).not.toHaveBeenCalled();
  });

  it('stays silent with no haptic, or with sound false', async () => {
    await render(
      <>
        <Pressable accessibilityLabel="Surface" haptic={false} />
        <Pressable accessibilityLabel="Quiet" sound={false} />
      </>,
    );
    await fireEvent(screen.getByRole('button', { name: 'Surface' }), 'pressIn');
    await fireEvent(screen.getByRole('button', { name: 'Quiet' }), 'pressIn');
    expect(playSound).not.toHaveBeenCalled();
  });
});
