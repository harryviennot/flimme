import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api';
import type { AvatarColor } from '@/components/ui/avatar';
import { useOnline } from '@/features/network';
import { applySavedProfile, submitName, type SubmitOutcome } from '@/features/profile';
import { startSession, useSession, useSessionFailed } from '@/features/session';
import { haptics } from '@/lib/haptics';

import { linkOpenedAt, takeLinkReceivedAt } from './link-received';
import { parseInviteLink, roomRouteFor } from './link';
import { STARTING_RETRIES, STARTING_RETRY_MS, type JoinMessage } from './rows';
import { JOIN_SHEET_ROWS, type SheetRow } from './sheet-rows';

type Refused = Extract<SheetRow, { kind: 'refused' }>;

/** What the join sheet shows. */
export type LinkView =
  | { kind: 'joining'; shuffling: boolean }
  | { kind: 'first-time'; hostName: string | null }
  | { kind: 'refused'; row: Refused; message: JoinMessage; params?: { max: number } };

export type NameError = 'invalid' | 'notAllowed';

type Params = { code?: string | string[]; r?: string | string[] };

/** Reads the route's parameters as strictly as an invite link: `null` when malformed. */
export function readLinkParams(params: Params): { code: string; ref?: string } | null {
  const { code, r } = params;
  if (typeof code !== 'string' || (r !== undefined && typeof r !== 'string')) return null;
  return parseInviteLink(r === undefined ? `/join/${code}` : `/join/${code}?r=${r}`);
}

/**
 * The join sheet's logic: waits for the guest session, joins with the link's code and room
 * reference, retries while the game is starting, waits while offline, and for a player with no
 * name asks for one and joins again. Never logs the code or the reference.
 */
export function useJoinLink(params: Params) {
  const link = readLinkParams(params);
  const code = link?.code;
  const ref = link?.ref;

  const online = useOnline();
  const session = useSession();
  const sessionFailed = useSessionFailed();
  const client = useQueryClient();

  const [receivedAt] = useState(() => takeLinkReceivedAt());
  const [view, setView] = useState<LinkView>(
    link ? { kind: 'joining', shuffling: false } : refusedView('malformed'),
  );
  const [nameError, setNameError] = useState<NameError | null>(null);
  const [saving, setSaving] = useState(false);

  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitingOnline = useRef(false);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  });

  const refuse = useCallback((state: keyof typeof JOIN_SHEET_ROWS, params?: { max: number }) => {
    const next = refusedView(state, params);
    if (next.kind === 'refused' && next.row.haptic) haptics.error();
    setView(next);
  }, []);

  const attempt = useCallback(async () => {
    if (!code) return;
    runId.current += 1;
    const id = runId.current;
    clearTimeout(timer.current);
    waitingOnline.current = false;
    if (!onlineRef.current) {
      waitingOnline.current = true;
      refuse('offline');
      return;
    }
    setView({ kind: 'joining', shuffling: false });
    for (let tries = 0; ; tries += 1) {
      let result;
      try {
        result = await api.joinRoom({
          code,
          ...(ref ? { ref } : {}),
          via: 'link',
          link_opened_at: linkOpenedAt(receivedAt),
        });
      } catch {
        if (id === runId.current) refuse('failed');
        return;
      }
      if (id !== runId.current) return;
      const row = JOIN_SHEET_ROWS[result.status as keyof typeof JOIN_SHEET_ROWS] as
        SheetRow | undefined;
      if (!row) {
        refuse('failed');
        return;
      }
      if (result.status === 'ok') {
        router.replace(roomRouteFor(result.room_id, result.state) as never);
        return;
      }
      if (result.status === 'name_required') {
        setView({ kind: 'first-time', hostName: result.host_name });
        return;
      }
      if (row.kind === 'wait') {
        if (tries >= STARTING_RETRIES) {
          haptics.error();
          setView({
            kind: 'refused',
            row: JOIN_SHEET_ROWS.failed as Refused,
            message: 'errors.starting',
          });
          return;
        }
        setView({ kind: 'joining', shuffling: true });
        await new Promise<void>((resolve) => {
          timer.current = setTimeout(resolve, STARTING_RETRY_MS);
        });
        if (id !== runId.current) return;
        continue;
      }
      refuse(result.status, result.status === 'full' ? { max: result.max_players } : undefined);
      return;
    }
  }, [code, ref, receivedAt, refuse]);

  const sessionOk = session?.status === 'ok';
  const sessionStatus = session?.status;

  // The session first: nothing is sent before the guest sign-in has answered.
  useEffect(() => {
    if (!link) return;
    if (sessionOk) {
      // Outside the effect body: the call sets state before its first await.
      void Promise.resolve().then(() => void attempt());
    } else if (sessionFailed || sessionStatus === 'refused') {
      void Promise.resolve().then(() => refuse('session_failed'));
    } else if (sessionStatus === 'offline') {
      waitingOnline.current = true;
      void Promise.resolve().then(() => refuse('offline'));
    }
    // `link` is read through code and ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, ref, sessionOk, sessionFailed, sessionStatus]);

  // Offline: join by itself when the connection comes back.
  useEffect(() => {
    if (!online || !waitingOnline.current) return;
    waitingOnline.current = false;
    if (sessionOk) {
      void Promise.resolve().then(() => void attempt());
    } else {
      void Promise.resolve().then(() => setView({ kind: 'joining', shuffling: false }));
      startSession().catch(() => {});
    }
  }, [online, sessionOk, attempt]);

  useEffect(
    () => () => {
      runId.current += 1;
      clearTimeout(timer.current);
    },
    [],
  );

  const retry = useCallback(() => {
    if (sessionOk) {
      void attempt();
      return;
    }
    setView({ kind: 'joining', shuffling: false });
    startSession()
      .then((answer) => {
        if (answer.status === 'refused') refuse('session_failed');
        else if (answer.status === 'offline') {
          waitingOnline.current = true;
          refuse('offline');
        }
      })
      .catch(() => refuse('session_failed'));
  }, [sessionOk, attempt, refuse]);

  /** Join on the first-time layout: saves the profile, then joins again. */
  const submit = useCallback(
    async (name: string, color: AvatarColor): Promise<SubmitOutcome> => {
      setSaving(true);
      const outcome = await submitName(name, color, {
        online: onlineRef.current,
        updateProfile: (args) => api.updateProfile(args),
      });
      setSaving(false);
      switch (outcome.kind) {
        case 'saved':
          applySavedProfile(client, outcome);
          void attempt();
          break;
        case 'invalid':
        case 'notAllowed':
          setNameError(outcome.kind);
          haptics.error();
          break;
        default:
          break;
      }
      return outcome;
    },
    [attempt, client],
  );

  return {
    view,
    retry,
    submit,
    saving,
    nameError,
    clearNameError: () => setNameError(null),
    code: code ?? (typeof params.code === 'string' ? params.code : ''),
  };
}

function refusedView(state: keyof typeof JOIN_SHEET_ROWS, params?: { max: number }): LinkView {
  const row = JOIN_SHEET_ROWS[state];
  if (row.kind !== 'refused') throw new Error(`No refusal for ${state}`);
  return { kind: 'refused', row, message: row.message, params };
}
