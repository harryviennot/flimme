export type RecapShareOutcome = 'shared' | 'capture_failed' | 'share_failed';

export type RecapShareDeps = {
  /** Resolves when the poster is in, or after the gate's 3 seconds. */
  waitForPoster: () => Promise<void>;
  /** Takes the full-size card to a PNG file and answers its uri. */
  capture: () => Promise<string>;
  /** Opens the system share sheet; resolves when it closes. */
  share: (uri: string) => Promise<void>;
  deleteFile: (uri: string) => void;
  /** The sheet closed without an error: the share is tracked (recap.md#sharing). */
  onShared: () => void;
};

/**
 * Poster, capture, share sheet, cleanup. `expo-sharing` resolves the same way for a share and
 * a cancel on iOS and Android, so a sheet that closes without an error counts as shared.
 */
export async function runRecapShare(deps: RecapShareDeps): Promise<RecapShareOutcome> {
  await deps.waitForPoster();
  let uri: string;
  try {
    uri = await deps.capture();
  } catch {
    return 'capture_failed';
  }
  try {
    await deps.share(uri);
  } catch {
    return 'share_failed';
  } finally {
    try {
      deps.deleteFile(uri);
    } catch {
      // The cache folder is cleared by the system anyway.
    }
  }
  deps.onShared();
  return 'shared';
}
