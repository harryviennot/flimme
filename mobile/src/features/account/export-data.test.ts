import { ApiError, type ExportMyDataResult } from '@flimme/contract';

import { exportFileName, runExport, type ExportDeps } from './export-data';

const data = {
  status: 'ok',
  profile: { display_name: 'Léa' },
  services: [8],
  consents: [],
  linked_accounts: [],
  letterboxd_diary: [],
  film_history: [],
  taste: null,
  games: [],
} as ExportMyDataResult;

function deps(overrides: Partial<ExportDeps> = {}) {
  const files = new Map<string, string>();
  const base: ExportDeps = {
    exportMyData: jest.fn(async () => data),
    writeFile: jest.fn((name: string, contents: string) => {
      files.set(`cache/${name}`, contents);
      return `cache/${name}`;
    }),
    share: jest.fn(async () => undefined),
    deleteFile: jest.fn((uri: string) => void files.delete(uri)),
    report: jest.fn(),
    now: () => new Date(2026, 10, 5, 23, 59),
    ...overrides,
  };
  return { d: base, files };
}

describe('download my data', () => {
  it('names the file with the local date', () => {
    expect(exportFileName(new Date(2026, 0, 9))).toBe('flimme-data-2026-01-09.json');
  });

  it('writes the data without status, shares it, then deletes the file', async () => {
    const { d, files } = deps();
    const order: string[] = [];
    (d.share as jest.Mock).mockImplementation(async (uri: string) => {
      order.push('share');
      expect(files.has(uri)).toBe(true);
    });
    (d.deleteFile as jest.Mock).mockImplementation((uri: string) => {
      order.push('delete');
      files.delete(uri);
    });
    const onReady = jest.fn();

    expect(await runExport({ ...d, onReady })).toBe('shared');

    const [name, contents] = (d.writeFile as jest.Mock).mock.calls[0] as [string, string];
    expect(name).toBe('flimme-data-2026-11-05.json');
    const parsed = JSON.parse(contents) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('status');
    expect(parsed.services).toEqual([8]);
    expect(contents).toContain('\n  "services"');
    expect(order).toEqual(['share', 'delete']);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(files.size).toBe(0);
  });

  it('writes no file on rate_limited', async () => {
    const { d } = deps({ exportMyData: async () => ({ status: 'rate_limited' }) });
    expect(await runExport(d)).toBe('rate_limited');
    expect(d.writeFile).not.toHaveBeenCalled();
    expect(d.share).not.toHaveBeenCalled();
  });

  it('says offline for a network error and failed for any other', async () => {
    const offline = deps({
      exportMyData: async () => {
        throw new ApiError('network', 'export_my_data', 'down');
      },
    });
    expect(await runExport(offline.d)).toBe('offline');
    const broken = deps({
      exportMyData: async () => {
        throw new ApiError('unexpected', 'export_my_data', 'bug');
      },
    });
    expect(await runExport(broken.d)).toBe('failed');
  });

  it('reports an unexpected answer by status only', async () => {
    const { d } = deps({ exportMyData: async () => ({ status: 'nope' }) as never });
    expect(await runExport(d)).toBe('failed');
    expect(d.report).toHaveBeenCalledWith('export_my_data: unexpected answer nope');
  });

  it('deletes the file even when the sheet fails, and says failed', async () => {
    const { d, files } = deps({
      share: async () => {
        throw new Error('no sheet');
      },
    });
    expect(await runExport(d)).toBe('failed');
    expect(files.size).toBe(0);
  });
});
