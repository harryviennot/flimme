import { useTranslation } from 'react-i18next';

import { useFinalCut } from '@/features/finale/use-final-cut';
import { useRevealView } from '@/features/finale/use-reveal';

import { FinalCutScreen } from './final-cut-screen';

/** The Final Cut route's body: the round the room is voting on, then its reveal. */
export function FinalCutRoom({ roomId }: { roomId: string }) {
  const { i18n } = useTranslation();
  const model = useFinalCut(roomId, i18n.language);
  const reveal = useRevealView(roomId, i18n.language);
  return <FinalCutScreen roomId={roomId} model={model} reveal={reveal} />;
}
