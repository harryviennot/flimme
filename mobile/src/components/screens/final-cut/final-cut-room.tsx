import { useTranslation } from 'react-i18next';

import { useFinalCut } from '@/features/finale/use-final-cut';

import { FinalCutScreen } from './final-cut-screen';

/** The Final Cut route's body: the round the room is voting on. */
export function FinalCutRoom({ roomId }: { roomId: string }) {
  const { i18n } = useTranslation();
  const model = useFinalCut(roomId, i18n.language);
  return <FinalCutScreen roomId={roomId} model={model} />;
}
