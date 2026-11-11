import { ApiError, type PersonResult, type SearchPeopleResult } from '@flimme/contract';

import {
  createPeopleSearch,
  knownForOf,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
} from './people';

const pitt: PersonResult = {
  id: 287,
  name: 'Brad Pitt',
  known_for: { title: 'Fight Club', year: 1999 },
};
const penelope: PersonResult = {
  id: 955,
  name: 'Pénélope Cruz',
  known_for: { title: 'Volver', year: 2006 },
};

function setup(answer: (query: string) => Promise<SearchPeopleResult>) {
  const search = jest.fn(answer);
  const report = jest.fn();
  const controller = createPeopleSearch({ search, report });
  return { search, report, controller };
}

const ok = (...people: PersonResult[]): Promise<SearchPeopleResult> =>
  Promise.resolve({ status: 'ok', people });

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('the people search', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits 300 ms after the last keystroke, and sends one call', async () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    const { controller, search } = setup(() => ok(pitt));
    controller.setText('pi');
    jest.advanceTimersByTime(200);
    controller.setText('pit');
    jest.advanceTimersByTime(200);
    expect(search).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('pit');
    await settle();
    expect(controller.getState().people).toEqual([pitt]);
    expect(controller.getState().busy).toBe(false);
  });

  it('makes no call under 2 characters, and clears earlier results', async () => {
    expect(SEARCH_MIN_LENGTH).toBe(2);
    const { controller, search } = setup(() => ok(pitt));
    controller.setText('pitt');
    jest.advanceTimersByTime(300);
    await settle();
    expect(controller.getState().people).toEqual([pitt]);
    controller.setText('p');
    expect(controller.getState()).toMatchObject({ people: null, busy: false, error: null });
    controller.setText('  p ');
    jest.advanceTimersByTime(1000);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('trims the query, and never calls over 60 characters', () => {
    expect(SEARCH_MAX_LENGTH).toBe(60);
    const { controller, search } = setup(() => ok());
    controller.setText('  penelope  ');
    jest.advanceTimersByTime(300);
    expect(search).toHaveBeenCalledWith('penelope');
    controller.setText('x'.repeat(61));
    jest.advanceTimersByTime(1000);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('drops a late answer from an older query', async () => {
    const resolvers: ((r: SearchPeopleResult) => void)[] = [];
    const { controller } = setup(
      () => new Promise<SearchPeopleResult>((resolve) => resolvers.push(resolve)),
    );
    controller.setText('pi');
    jest.advanceTimersByTime(300);
    controller.setText('pit');
    jest.advanceTimersByTime(300);
    resolvers[1]?.({ status: 'ok', people: [pitt] });
    await settle();
    resolvers[0]?.({ status: 'ok', people: [penelope] });
    await settle();
    expect(controller.getState().people).toEqual([pitt]);
  });

  it('keeps the old rows while searching again, and shows skeletons the first time', async () => {
    const { controller } = setup(() => ok(pitt));
    controller.setText('pi');
    expect(controller.getState()).toMatchObject({ people: null, busy: true });
    jest.advanceTimersByTime(300);
    await settle();
    controller.setText('pit');
    expect(controller.getState()).toMatchObject({ people: [pitt], busy: true });
  });

  it('an empty answer is an empty list, not an error', async () => {
    const { controller } = setup(() => ok());
    controller.setText('zzzz');
    jest.advanceTimersByTime(300);
    await settle();
    expect(controller.getState()).toMatchObject({ people: [], error: null, busy: false });
  });

  it('invalid is a failure, reported by status only', async () => {
    const { controller, report } = setup(() => Promise.resolve({ status: 'invalid' }));
    controller.setText('penelope');
    jest.advanceTimersByTime(300);
    await settle();
    expect(controller.getState().error).toBe('failed');
    expect(report).toHaveBeenCalledWith('invalid');
    expect(JSON.stringify(report.mock.calls)).not.toContain('penelope');
  });

  it('rate_limited shows as a failure and is not reported', async () => {
    const { controller, report } = setup(() => Promise.resolve({ status: 'rate_limited' }));
    controller.setText('penelope');
    jest.advanceTimersByTime(300);
    await settle();
    expect(controller.getState().error).toBe('failed');
    expect(report).not.toHaveBeenCalled();
  });

  it('a network error is offline, any other throw is failed, and retry searches again', async () => {
    let next: () => Promise<SearchPeopleResult> = () =>
      Promise.reject(new ApiError('network', 'search_people', 'the request failed'));
    const { controller, search } = setup(() => next());
    controller.setText('pitt');
    jest.advanceTimersByTime(300);
    await settle();
    expect(controller.getState().error).toBe('offline');
    next = () => Promise.reject(new Error('boom'));
    controller.retry();
    await settle();
    expect(controller.getState().error).toBe('failed');
    next = () => ok(pitt);
    controller.retry();
    await settle();
    expect(controller.getState()).toMatchObject({ error: null, people: [pitt] });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('offline: makes no call, and searches the current text once back online', async () => {
    const { controller, search } = setup(() => ok(pitt));
    controller.setOnline(false);
    controller.setText('pitt');
    jest.advanceTimersByTime(1000);
    expect(search).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ error: 'offline', busy: false });
    controller.setText('pitt b');
    controller.setOnline(true);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('pitt b');
    await settle();
    expect(controller.getState().people).toEqual([pitt]);
  });

  it('never keeps the query in its state or its reports', async () => {
    const { controller, report } = setup(() => Promise.resolve({ status: 'invalid' }));
    controller.setText('penelope');
    jest.advanceTimersByTime(300);
    await settle();
    expect(JSON.stringify(controller.getState())).not.toContain('penelope');
    expect(JSON.stringify(report.mock.calls)).not.toContain('penelope');
  });
});

describe('knownForOf', () => {
  it('says the title and its year, the title alone, or nothing', () => {
    expect(knownForOf(pitt)).toEqual({ title: 'Fight Club', year: 1999 });
    expect(knownForOf({ ...pitt, known_for: { title: 'Fight Club', year: null } })).toEqual({
      title: 'Fight Club',
      year: null,
    });
    expect(knownForOf({ id: 1, name: 'X', known_for: null } as unknown as PersonResult)).toBeNull();
  });
});
