// What Send does on the report sheet (report-sheet.md#answers), without JSX: one call, every
// answer turned into an outcome the sheet shows. Nothing here logs the reason, a name or an id.
import type { ReportMemberAnswer, ReportMemberResult, ReportReason } from '@flimme/contract';

export type ReportOutcome =
  /** `ok`, new or repeat: the thank-you state. */
  | { kind: 'sent' }
  /** `rate_limited`: the sheet stays, a line under Send says so. */
  | { kind: 'rate_limited' }
  /** `not_in_room`: close the sheet, warn, read the seats again. */
  | { kind: 'not_in_room' }
  /** The call failed: the warn toast, the sheet stays. The api layer reports real errors. */
  | { kind: 'failed' };

/** One behaviour per answer; a test walks `REPORT_MEMBER_ANSWERS` against it. */
export const REPORT_OUTCOMES: Record<ReportMemberAnswer, ReportOutcome> = {
  ok: { kind: 'sent' },
  rate_limited: { kind: 'rate_limited' },
  not_in_room: { kind: 'not_in_room' },
};

export async function runReport(
  reportMember: (args: {
    room_id: string;
    member_id: string;
    reason: ReportReason;
  }) => Promise<ReportMemberResult>,
  args: { roomId: string; memberId: string; reason: ReportReason },
): Promise<ReportOutcome> {
  try {
    const answer = await reportMember({
      room_id: args.roomId,
      member_id: args.memberId,
      reason: args.reason,
    });
    return REPORT_OUTCOMES[answer.status];
  } catch {
    // A network failure is not a bug; anything else was already reported by `src/api/`.
    return { kind: 'failed' };
  }
}
