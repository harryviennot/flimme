import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { GenreChips } from './genre-chips';

const options = [
  { id: 1, name: 'Action', count: 2 },
  { id: 2, name: 'Comedy', count: 3 },
  { id: 3, name: 'Drama', count: 0 },
  { id: 4, name: 'Science-Fiction', count: 1 },
];

function Demo({ showCounts, start }: { showCounts: boolean; start: number[] }) {
  const [picked, setPicked] = useState(start);
  return (
    <GenreChips
      options={options}
      selected={picked}
      showCounts={showCounts}
      onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
    />
  );
}

export const gallery: GalleryEntry = {
  name: 'GenreChips',
  tier: 'shared',
  description:
    "Tonight's genres as chips with optional player counts: loading, none selected, three selected with counts, without counts, and a long name, one genre out tonight, and skip mode with two skipped.",
  render: () => (
    <View className="gap-6">
      <GenreChips options={[]} selected={[]} showCounts={false} onToggle={() => {}} loading />
      <Demo showCounts start={[]} />
      <Demo showCounts start={[1, 2, 4]} />
      <Demo showCounts={false} start={[2]} />
      <GenreChips
        options={options}
        selected={[1]}
        showCounts
        onToggle={() => {}}
        outTonight={[3]}
      />
      <GenreChips
        mode="skip"
        options={options}
        selected={[3, 4]}
        showCounts={false}
        onToggle={() => {}}
      />
    </View>
  ),
};
