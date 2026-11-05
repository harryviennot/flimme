import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

import { showToast, type ToastProps } from '@/components/ui/toast';
import { haptics } from '@/lib/haptics';

type Deps = {
  copy: (text: string) => Promise<unknown>;
  toast: (toast: ToastProps) => void;
  haptic: () => void;
};

/** Copies the room code (six digits, no space, so it pastes into the join field). Never logged. */
export async function copyRoomCode(code: string, copiedTitle: string, deps: Deps): Promise<void> {
  deps.haptic();
  try {
    await deps.copy(code);
  } catch {
    // The clipboard refused: say nothing rather than claim a copy that did not happen.
    return;
  }
  deps.toast({ tone: 'success', title: copiedTitle });
}

/** What a long press on the ticket (or its screen reader action) does. */
export function useCopyRoomCode(code: string | undefined): () => void {
  const { t } = useTranslation('lobby');
  return () => {
    if (!code) return;
    void copyRoomCode(code, t('ticket.copied'), {
      copy: (text) => Clipboard.setStringAsync(text),
      toast: showToast,
      haptic: () => haptics.press(),
    });
  };
}
