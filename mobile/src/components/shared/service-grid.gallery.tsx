import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

import type { GalleryEntry } from '../gallery';
import { ServiceGrid } from './service-grid';

const names = [
  'Netflix',
  'Prime Video',
  'Disney+',
  'Canal+',
  'Apple TV+',
  'Max',
  'OCS',
  'Paramount+',
  'Crunchyroll',
  'Arte',
  'MUBI',
  'Salto',
  'Molotov',
  'Orange',
  'Filmo',
  'Universciné',
  'Shadow',
  'Netflix Kids',
];
const services = names.map((name, i) => ({ id: i + 1, name }));

function Demo({ start, count }: { start: number[]; count: number }) {
  const [selected, setSelected] = useState(start);
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return <ServiceGrid services={services.slice(0, count)} selected={selected} onToggle={toggle} />;
}

export const gallery: GalleryEntry = {
  name: 'Service grid',
  tier: 'shared',
  description: 'Service tiles in rows of three: host setup and the lobby services sheet.',
  render: () => (
    <View className="gap-6">
      <Text variant="mono-eyebrow" tone="secondary">
        Loading
      </Text>
      <ServiceGrid services={[]} selected={[]} onToggle={() => {}} loading />
      <Text variant="mono-eyebrow" tone="secondary">
        None selected, short last row
      </Text>
      <Demo start={[]} count={7} />
      <Text variant="mono-eyebrow" tone="secondary">
        Three selected
      </Text>
      <Demo start={[1, 2, 4]} count={6} />
      <Text variant="mono-eyebrow" tone="secondary">
        A long list
      </Text>
      <Demo start={[3]} count={18} />
    </View>
  ),
};
