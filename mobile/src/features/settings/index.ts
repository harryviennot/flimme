import { setHapticsEnabled } from '@/lib/haptics';
import { setSoundEnabled } from '@/lib/sound';

import { bindSettings, createSettingsStore } from './store';

export const useSettingsStore = createSettingsStore();

// Hydration is synchronous, so haptics and sound have the saved values before anything
// renders. Importing this module once at the root is what turns the switches on.
bindSettings(useSettingsStore, { haptics: setHapticsEnabled, sound: setSoundEnabled });
