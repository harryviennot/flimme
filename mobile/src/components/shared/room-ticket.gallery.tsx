import type { GalleryEntry } from '../gallery';
import { RoomTicket } from './room-ticket';

export const gallery: GalleryEntry = {
  name: 'Room ticket',
  tier: 'shared',
  description: 'The room code as a cinema ticket, readable across a couch.',
  render: () => (
    <RoomTicket code="482913" leftDetail="3 of 10 players" rightDetail="Host · Harry" />
  ),
};
