// The wipe (security.md#account-deletion-and-data-export, step 5): the phone signs out and forgets
// everything it kept, then starts as a new guest. It runs after a deletion, and when the user
// behind the stored session no longer exists.

type ResettableStore = {
  getInitialState: () => unknown;
  setState: (state: never, replace: true) => void;
  persist: { clearStorage: () => void };
};

/** Puts a persisted store back to its first values and removes what it saved on the phone. */
export function resetPersistedStore(store: ResettableStore): void {
  // The state first (it saves itself), then the saved copy, so nothing is left behind.
  store.setState(store.getInitialState() as never, true);
  store.persist.clearStorage();
}

export type WipeDeps = {
  /** Ends the session on this phone only (no call to the server). */
  signOut: () => Promise<void>;
  /** Every persisted store, the vote queue and the profile copy, each back to nothing. */
  clearLocal: (() => void)[];
  /** The TanStack Query cache. */
  clearQueries: () => void;
  /** Signs in as a new guest. */
  startGuest: () => Promise<unknown>;
};

export async function wipeWith(deps: WipeDeps): Promise<void> {
  try {
    await deps.signOut();
  } catch {
    // The session is cleared below whatever happened to the call.
  }
  for (const clear of deps.clearLocal) {
    try {
      clear();
    } catch {
      // One store failing must not leave the others full.
    }
  }
  deps.clearQueries();
  try {
    await deps.startGuest();
  } catch {
    // The splash shows its own error state and retries.
  }
}
