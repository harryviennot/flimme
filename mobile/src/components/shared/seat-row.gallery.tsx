import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { SeatRow } from './seat-row';

export const gallery: GalleryEntry = {
  name: 'Seat row',
  tier: 'shared',
  description:
    'One seat of the lobby or of the swipe screen players sheet: avatar, name, a detail line (services or the film count) and at most one tag (away, then Done, then the host).',
  render: () => (
    <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
      <SeatRow name="Harry" color="blue" detail="14 films" isHost isMe present />
      <SeatRow name="Sam" color="green" detail="10 films" isHost={false} isMe={false} present />
      <SeatRow
        name="Jo"
        color="violet"
        detail="5 films"
        isHost={false}
        isMe={false}
        present={false}
        away
      />
      <SeatRow
        name="Alex"
        color="teal"
        detail="20 films"
        isHost={false}
        isMe={false}
        present
        done
      />
      <SeatRow name="Léa" color="gold" detail="20 films" isHost isMe={false} present done />
      <SeatRow
        name="Max"
        color="pink"
        detail="Netflix, Disney+"
        isHost={false}
        isMe={false}
        present
        last
      />
    </View>
  ),
};
