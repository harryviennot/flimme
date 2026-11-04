import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOnline } from '@/features/network';
import { releaseRoomGuards, useExitRoomToHome } from '@/features/room';
import { useMatchShown } from '@/features/room/match-shown';
import { arrivedLive } from '@/features/winner/arrival';
import { useWinner } from '@/features/winner/use-winner';

import { WinnerScreen } from './winner-screen';

/** The winner route's body: the room's pick, and the way Home (Q16.4). */
export function WinnerRoom({ roomId }: { roomId: string }) {
  const { i18n } = useTranslation();
  const view = useWinner(roomId, i18n.language);
  const online = useOnline();
  const exitToHome = useExitRoomToHome();
  const played = useMatchShown(roomId);
  // Read once, when the screen appears.
  const [fadeIn] = useState(() => arrivedLive(roomId, played));

  return (
    <WinnerScreen
      view={view}
      language={i18n.language}
      online={online}
      fadeIn={fadeIn}
      onHome={() => {
        releaseRoomGuards();
        exitToHome();
      }}
    />
  );
}
