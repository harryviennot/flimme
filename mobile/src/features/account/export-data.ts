import { ApiError, type ExportMyDataResult } from '@flimme/contract';

export type ExportOutcome = 'shared' | 'rate_limited' | 'offline' | 'failed';

export type ExportDeps = {
  exportMyData: () => Promise<ExportMyDataResult>;
  /** Writes the text to a file in the cache folder and answers its uri. */
  writeFile: (name: string, contents: string) => string;
  /** Opens the share sheet; resolves when it closes. */
  share: (uri: string) => Promise<void>;
  deleteFile: (uri: string) => void;
  /** Called when the sheet is about to open: the row stops spinning. */
  onReady?: () => void;
  /** An answer that means a bug: its status only, never the data. */
  report: (message: string) => void;
  now?: () => Date;
};

/** `flimme-data-YYYY-MM-DD.json`, the date on the player's own clock. */
export function exportFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `flimme-data-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** The file's text: the data, pretty-printed, without the `status` field. */
export function exportFileContents(result: Extract<ExportMyDataResult, { status: 'ok' }>): string {
  const { status: _status, ...data } = result;
  return JSON.stringify(data, null, 2);
}

/**
 * Download my data (settings.md): asks the server, writes the file, opens the share sheet and
 * deletes the file once the sheet closes, shared or not. Nothing about the data is logged or
 * reported.
 */
export async function runExport(deps: ExportDeps): Promise<ExportOutcome> {
  let result: ExportMyDataResult;
  try {
    result = await deps.exportMyData();
  } catch (error) {
    return error instanceof ApiError && error.kind === 'network' ? 'offline' : 'failed';
  }
  if (result.status === 'rate_limited') return 'rate_limited';
  if (result.status !== 'ok') {
    deps.report(
      `export_my_data: unexpected answer ${String((result as { status?: unknown }).status)}`,
    );
    return 'failed';
  }

  let uri: string | undefined;
  try {
    uri = deps.writeFile(
      exportFileName((deps.now ?? (() => new Date()))()),
      exportFileContents(result),
    );
    deps.onReady?.();
    await deps.share(uri);
    return 'shared';
  } catch {
    return 'failed';
  } finally {
    if (uri) {
      try {
        deps.deleteFile(uri);
      } catch {
        // The cache folder is cleaned by the system anyway.
      }
    }
  }
}
