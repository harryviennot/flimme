import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { TabBar } from './tab-bar';

const noop = () => undefined;

const english = [
  { key: 'play', label: 'Play', icon: 'play' },
  { key: 'my-films', label: 'My films', icon: 'film' },
] as const;

const french = [
  { key: 'play', label: 'Jouer', icon: 'play' },
  { key: 'my-films', label: 'Mes films', icon: 'film' },
] as const;

export const gallery: GalleryEntry = {
  name: 'Tab bar',
  tier: 'ui',
  description: 'The bottom bar of the home tabs: Play and My films, the selected one in gold.',
  render: () => (
    <View className="-mx-5 gap-4">
      <TabBar items={english} selected="play" onSelect={noop} />
      <TabBar items={english} selected="my-films" onSelect={noop} />
      <TabBar items={french} selected="play" onSelect={noop} />
    </View>
  ),
};
