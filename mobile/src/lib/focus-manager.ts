import { focusManager } from '@tanstack/react-query';
import type { AppState } from 'react-native';

// Query refetches when the app comes back to the foreground, not on web-style window focus.
export function watchAppFocus(appState: Pick<typeof AppState, 'addEventListener'>) {
  focusManager.setEventListener((handleFocus) => {
    const subscription = appState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });
    return () => subscription.remove();
  });
}
