// The report: what was played, each measured percentile and a line per target with pass, fail
// or "read by hand". No account, id or room code can get in: it only takes numbers.
import { summarize } from './stats';

export type Measures = {
  castVoteMs: number[];
  matchMs: number[];
  /** Fallback deals the bots saw in `start_game` and `request_cards` answers. */
  fallbackDeals: number;
  /** Deals the bots saw (`start_game` answers): none means nothing was observed. */
  deals: number;
  /** From the ledger compared with the database counts; null until `check` has run. */
  lost: number | null;
  duplicated: number | null;
  /** `cast_vote` calls that threw instead of answering. */
  castVoteErrors: number;
};

export type TargetLine = {
  name: string;
  target: string;
  value: string;
  status: 'pass' | 'fail' | 'no data' | 'by hand';
  how: string;
};

const ms = (value: number | null) => (value === null ? 'no data' : `${Math.round(value)} ms`);

export function sinceQueries(since: string) {
  return {
    deck: `select calls, round(mean_exec_time::numeric, 1) as mean_ms, round(stddev_exec_time::numeric, 1) as stddev_ms, round(max_exec_time::numeric, 1) as max_ms from pg_stat_statements where query ilike '%deck_candidates%' order by calls desc;  -- p95 is about mean + 1.645 x stddev`,
    deal: `select count(*) as deals, round(percentile_cont(0.95) within group (order by latency_ms)::numeric) as p95_ms from rec.requests where created_at >= '${since}' and not is_fallback;`,
    fallback: `select count(*) as fallback_deals from rec.requests where created_at >= '${since}' and is_fallback;`,
  };
}

export function evaluateTargets(measures: Measures, since = '<start of the run>'): TargetLine[] {
  const queries = sinceQueries(since);
  const vote = summarize(measures.castVoteMs);
  const match = summarize(measures.matchMs);
  const judge = (p95: number | null, limit: number): TargetLine['status'] =>
    p95 === null ? 'no data' : p95 < limit ? 'pass' : 'fail';

  let lostLine: Pick<TargetLine, 'value' | 'status' | 'how'>;
  if (measures.lost === null || measures.duplicated === null) {
    lostLine = {
      value: 'not compared yet',
      status: 'by hand',
      how: 'Count rows per seat after the run: `select room_member_id, count(*) from public.votes group by 1`, save it as JSON, then `check --ledger <file> --counts <file>`.',
    };
  } else {
    lostLine = {
      value: `${measures.lost} lost, ${measures.duplicated} duplicated`,
      status: measures.lost === 0 && measures.duplicated === 0 ? 'pass' : 'fail',
      how: 'Ledger compared with the votes table.',
    };
  }

  return [
    {
      name: '`cast_vote` round trip, p95',
      target: 'under 300 ms',
      value: ms(vote.p95),
      status: measures.castVoteErrors > 0 && vote.p95 !== null ? 'fail' : judge(vote.p95, 300),
      how: `Measured by the bots over ${vote.count} votes. ${measures.castVoteErrors} calls threw instead of answering (any is a fail).`,
    },
    {
      name: 'A match reaching the other phones, p95',
      target: 'under 1 second',
      value: ms(match.p95),
      status: judge(match.p95, 1000),
      how: `Measured from the matching vote's answer to each other bot's Realtime event (an event that arrives first counts as 0 ms), over ${match.count} receptions.`,
    },
    {
      name: '`internal.deck_candidates`, p95',
      target: 'under 150 ms',
      value: 'read by hand',
      status: 'by hand',
      how: queries.deck,
    },
    {
      name: 'A deal from the deck worker, p95',
      target: 'under 1 second',
      value: 'read by hand',
      status: 'by hand',
      how: queries.deal,
    },
    {
      name: 'Fallback deals',
      target: 'none',
      value: `${measures.fallbackDeals} seen by the bots`,
      status: measures.deals === 0 ? 'no data' : measures.fallbackDeals === 0 ? 'pass' : 'fail',
      how: `The bots only see the ones in their own answers. Confirm: ${queries.fallback}`,
    },
    { name: 'Lost or duplicated votes', target: 'none', ...lostLine },
    {
      name: 'Database CPU',
      target: 'under 70% sustained',
      value: 'read by hand',
      status: 'by hand',
      how: "Supabase dashboard, Reports, Database, for the run's time window.",
    },
    {
      name: 'New Sentry issues',
      target: 'none',
      value: 'read by hand',
      status: 'by hand',
      how: 'Sentry, Issues, first seen during the run, on both the app and server projects.',
    },
  ];
}

export type ReportInput = {
  date: string;
  scenario: {
    rooms4: number;
    rooms10: number;
    rampMs: number;
    durationMs: number;
    bots: number;
    swipeMs: number;
    likeRate: number;
    target: string;
  };
  ramp: string;
  rooms: {
    started: number;
    cycles: number;
    picks: number;
    noPicks: number;
    abandoned: number;
    timeToPickMs: number[];
  };
  measures: Measures;
  /** Games that could not be played, by step and answer. */
  failures?: Record<string, number>;
  startGameMs: number[];
  /** ISO time the run started, for the queries. */
  since: string;
};

const minutes = (value: number) => `${Math.round((value / 60_000) * 10) / 10} min`;
const LABEL = {
  pass: 'PASS',
  fail: 'FAIL',
  'no data': 'NO DATA',
  'by hand': 'read by hand',
} as const;

export function buildReport(input: ReportInput): string {
  const { scenario, rooms, measures } = input;
  const toPick = summarize(rooms.timeToPickMs);
  const start = summarize(input.startGameMs);
  const lines = evaluateTargets(measures, input.since);
  const out: string[] = [];
  out.push(`# Load run ${input.date}`, '');
  out.push('## Scenario', '');
  out.push(
    `- Target: ${scenario.target}. ${scenario.rooms4} rooms of 4 and ${scenario.rooms10} rooms of 10 (${scenario.bots} bots).`,
    `- Ramp: ${input.ramp}, over ${minutes(scenario.rampMs)}. Duration: ${minutes(scenario.durationMs)}.`,
    `- Bots swipe about every ${scenario.swipeMs / 1000} seconds (personalities scale it) and like about ${Math.round(scenario.likeRate * 100)}% of cards.`,
    '',
  );
  out.push('## Rooms played', '');
  out.push(
    `- Rooms started: ${rooms.started}. Games played: ${rooms.cycles}.`,
    `- Picks: ${rooms.picks}. Ended with no pick: ${rooms.noPicks}. Given up (timeout or stop): ${rooms.abandoned}.`,
    `- Time from start to a pick: p50 ${toPick.p50 === null ? 'no data' : minutes(toPick.p50)}, p95 ${toPick.p95 === null ? 'no data' : minutes(toPick.p95)} (goal: about 5 minutes).`,
    `- \`start_game\` answer time as the host sees it: p50 ${ms(start.p50)}, p95 ${ms(start.p95)} over ${start.count} starts.`,
    `- \`cast_vote\` calls that threw instead of answering: ${measures.castVoteErrors}.`,
    `- Games that could not be played: ${
      Object.entries(input.failures ?? {})
        .map(([reason, n]) => `${reason} x${n}`)
        .join(', ') || 'none'
    }.`,
    '',
  );
  out.push('## Targets', '');
  out.push('| Measure | Target | Result | Verdict |', '| --- | --- | --- | --- |');
  for (const line of lines) {
    out.push(`| ${line.name} | ${line.target} | ${line.value} | ${LABEL[line.status]} |`);
  }
  out.push('', '## How each line was read', '');
  for (const line of lines) out.push(`- ${line.name}: ${line.how}`);
  out.push(
    '',
    'Bots have made-up tastes: these numbers test the machinery, not whether the game is fun.',
    '',
  );
  return out.join('\n');
}
