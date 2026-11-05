import { fireEvent, render, screen } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TabBar } from './tab-bar';

const frame = { x: 0, y: 0, width: 375, height: 667 };
const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const show = (ui: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={{ frame, insets }}>{ui}</SafeAreaProvider>);

const items = [
  { key: 'play', label: 'Play', icon: 'play' },
  { key: 'my-films', label: 'My films', icon: 'film' },
] as const;

describe('TabBar', () => {
  it('marks the selected tab for screen readers', async () => {
    await show(<TabBar items={items} selected="my-films" onSelect={jest.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'My films' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Play' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('selects another tab on press', async () => {
    const onSelect = jest.fn();
    const onReselect = jest.fn();
    await show(
      <TabBar items={items} selected="play" onSelect={onSelect} onReselect={onReselect} />,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'My films' }));
    expect(onSelect).toHaveBeenCalledWith('my-films');
    expect(onReselect).not.toHaveBeenCalled();
  });

  it('reports a press on the selected tab as a reselect', async () => {
    const onSelect = jest.fn();
    const onReselect = jest.fn();
    await show(
      <TabBar items={items} selected="play" onSelect={onSelect} onReselect={onReselect} />,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Play' }));
    expect(onReselect).toHaveBeenCalledWith('play');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the labels it is given', async () => {
    await show(
      <TabBar
        items={[
          { key: 'play', label: 'Jouer', icon: 'play' },
          { key: 'my-films', label: 'Mes films', icon: 'film' },
        ]}
        selected="play"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Mes films' })).toBeTruthy();
  });
});
