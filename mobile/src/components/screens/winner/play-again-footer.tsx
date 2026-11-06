import type { PlayAgainFooterState } from '@/features/play-again/use-footer';

import { JoinOffer } from './join-offer';
import { PlayAgain } from './play-again';

/** The piece above Home: the Join offer once a next room is open, else the host's Play again. */
export function PlayAgainFooter({ state }: { state: PlayAgainFooterState }) {
  if (state.kind === 'offer') {
    return (
      <JoinOffer
        host={state.host}
        view={state.joinOffer.view}
        arrived={state.arrived}
        onJoin={state.joinOffer.join}
      />
    );
  }
  if (state.kind === 'play-again') {
    return <PlayAgain loading={state.playAgain.loading} onPress={state.playAgain.press} />;
  }
  return null;
}
