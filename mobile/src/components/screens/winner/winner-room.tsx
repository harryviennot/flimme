import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { roomSizeBucket } from '@/features/analytics/journey';
import { useOnline } from '@/features/network';
import { releaseRoomGuards, useExitRoomToHome, useRoomSeats } from '@/features/room';
import { useMatchShown } from '@/features/room/match-shown';
import { usePlayAgainFooter } from '@/features/play-again';
import { arrivedLive } from '@/features/winner/arrival';
import { takeJustPicked } from '@/features/solo/pick';
import { useIsSolo } from '@/features/solo/use-solo-room';
import { useWinner } from '@/features/winner/use-winner';

import { track } from '@/lib/analytics';

import { PlayAgainFooter } from './play-again-footer';
import { WinnerScreen } from './winner-screen';

/** The winner route's body: the room's pick, and the way Home (Q16.4). */
export function WinnerRoom({ roomId }: { roomId: string }) {
  const { i18n } = useTranslation();
  const view = useWinner(roomId, i18n.language);
  const online = useOnline();
  const exitToHome = useExitRoomToHome();
  const played = useMatchShown(roomId);
  const seats = useRoomSeats(roomId).data;
  const players = seats ? seats.filter((seat) => seat.left_at === null).length : 0;
  const solo = useIsSolo(roomId);
  // Read once, when the screen appears: only a pick made on this phone just now has the landing.
  const [lands] = useState(() => takeJustPicked(roomId));
  const footer = usePlayAgainFooter(roomId, solo);
  // A solo pick is not a group win: its analytics belong to the solo events (M6.46).
  const outcome = view.status === 'ready' && !solo ? view.outcome : null;
  // The pick is on screen: reported once per visit, with how it was made and the room's size.
  const reported = useRef(false);
  useEffect(() => {
    if (!outcome || players === 0 || reported.current) return;
    reported.current = true;
    track('winner:view', { outcome, room_size: roomSizeBucket(players) });
  }, [outcome, players]);
  // Read once, when the screen appears.
  const [fadeIn] = useState(() => arrivedLive(roomId, played));

  return (
    <WinnerScreen
      view={view}
      language={i18n.language}
      online={online}
      fadeIn={fadeIn || lands}
      solo={solo}
      lands={lands}
      above={footer.kind ? <PlayAgainFooter state={footer} /> : undefined}
      onHome={() => {
        releaseRoomGuards();
        exitToHome();
      }}
    />
  );
}
