import { useQueryClient } from '@tanstack/react-query';
import { router, useRootNavigationState } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api';
import type { AvatarColor } from '@/components/ui/avatar';
import { useOnline } from '@/features/network';
import {
  applySavedProfile,
  submitName,
  toAvatarColor,
  useMyProfile,
  type SubmitOutcome,
} from '@/features/profile';
import { startSession, useSession, useSessionFailed } from '@/features/session';
import { haptics } from '@/lib/haptics';

import { linkOpenedAt, takeLinkReceivedAt } from './link-received';
import { roomEntry, type RootRoute } from './enter-room';
import { parseInviteLink, roomRouteFor } from './link';
import { STARTING_RETRIES, STARTING_RETRY_MS, type JoinMessage } from './rows';
import { JOIN_SHEET_ROWS, type SheetRow } from './sheet-rows';

type Refused = Extract<SheetRow, { kind: 'refused' }>;

/** What the preview tells about the room: the host and the count, read once (Q20.5). */
export type JoinHost = { name: string | null; color: AvatarColor; players: number };

/** What the join sheet shows. */
export type LinkView =
  /** The session starting, the profile loading or the preview in flight. */
  | { kind: 'loading' }
  | { kind: 'joining'; shuffling: boolean }
  /** A named player, before the tap: `busy` once Join is tapped. */
  | { kind: 'confirm'; host: JoinHost; busy: boolean; shuffling: boolean }
  | { kind: 'first-time'; host: JoinHost | null; hostName: string | null }
  | { kind: 'refused'; row: Refused; message: JoinMessage; params?: { max: number } };

/** The preview answered `ok` for a player who is not seated: the layout waits on the profile. */
type Ready = {
  kind: 'ready';
  host: JoinHost | null;
  /** `name_required` from `join_room`, or the host's name when there was no preview. */
  needName: boolean;
  hostName: string | null;
  busy: boolean;
  shuffling: boolean;
};
type State = Exclude<LinkView, { kind: 'confirm' }> | Ready;

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
  const [state, setState] = useState<State>(link ? openingView(ref) : refusedView('malformed'));
  const [nameError, setNameError] = useState<NameError | null>(null);
  const [saving, setSaving] = useState(false);

  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitingOnline = useRef(false);
  // The host from the preview, and which step to run again (Retry, back online).
  const hostRef = useRef<JoinHost | null>(null);
  const step = useRef<'preview' | 'join'>(ref ? 'preview' : 'join');
  // Join was tapped on Confirm: the button shows the wait, the layout stays.
  const keepConfirm = useRef(false);
  const onlineRef = useRef(online);
  // The root stack's routes now, read when the answer comes in (a call can outlive renders).
  const rootRoutes = useRef<readonly RootRoute[]>([]);
  const navigationState = useRootNavigationState();
  useEffect(() => {
    onlineRef.current = online;
    rootRoutes.current = navigationState?.routes ?? [];
  });

  const refuse = useCallback((state: keyof typeof JOIN_SHEET_ROWS, params?: { max: number }) => {
    const next = refusedView(state, params);
    if (next.kind === 'refused' && next.row.haptic) haptics.error();
    setState(next);
  }, []);

  const attempt = useCallback(
    async (keep: boolean) => {
      if (!code) return;
      keepConfirm.current = keep;
      runId.current += 1;
      const id = runId.current;
      clearTimeout(timer.current);
      waitingOnline.current = false;
      if (!onlineRef.current) {
        waitingOnline.current = true;
        refuse('offline');
        return;
      }
      setState(waitView(hostRef.current, keep, false));
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
          enterRoom(roomRouteFor(result.room_id, result.state), result.room_id, rootRoutes.current);
          return;
        }
        if (result.status === 'name_required') {
          setState({
            kind: 'ready',
            host: hostRef.current,
            needName: true,
            hostName: result.host_name,
            busy: false,
            shuffling: false,
          });
          return;
        }
        if (row.kind === 'wait') {
          if (tries >= STARTING_RETRIES) {
            haptics.error();
            setState({
              kind: 'refused',
              row: JOIN_SHEET_ROWS.failed as Refused,
              message: 'errors.starting',
            });
            return;
          }
          setState(waitView(hostRef.current, keep, true));
          await new Promise<void>((resolve) => {
            timer.current = setTimeout(resolve, STARTING_RETRY_MS);
          });
          if (id !== runId.current) return;
          continue;
        }
        refuse(result.status, result.status === 'full' ? { max: result.max_players } : undefined);
        return;
      }
    },
    [code, ref, receivedAt, refuse],
  );

  const preview = useCallback(async () => {
    if (!code || !ref) return;
    runId.current += 1;
    const id = runId.current;
    clearTimeout(timer.current);
    waitingOnline.current = false;
    step.current = 'preview';
    if (!onlineRef.current) {
      waitingOnline.current = true;
      refuse('offline');
      return;
    }
    setState({ kind: 'loading' });
    let result;
    try {
      result = await api.roomPreview({ code, ref });
    } catch {
      if (id === runId.current) refuse('failed');
      return;
    }
    if (id !== runId.current) return;
    if (result.status !== 'ok') {
      refuse(result.status, result.status === 'full' ? { max: result.max_players } : undefined);
      return;
    }
    hostRef.current = {
      name: result.host_name || null,
      color: toAvatarColor(result.host_avatar_key ?? ''),
      players: result.players,
    };
    step.current = 'join';
    // Seated: it's their room, straight back in.
    if (result.seated) void attempt(false);
    else
      setState({
        kind: 'ready',
        host: hostRef.current,
        needName: false,
        hostName: null,
        busy: false,
        shuffling: false,
      });
  }, [code, ref, refuse, attempt]);

  /** Runs the step the sheet is on: the preview, or the join. */
  const resume = useCallback(() => {
    if (step.current === 'preview') void preview();
    else void attempt(keepConfirm.current);
  }, [preview, attempt]);

  const start = useCallback(() => {
    if (ref) void preview();
    else void attempt(false);
  }, [ref, preview, attempt]);

  const sessionOk = session?.status === 'ok';
  const sessionStatus = session?.status;

  // The session first: nothing is sent before the guest sign-in has answered.
  useEffect(() => {
    if (!link) return;
    if (sessionOk) {
      // Outside the effect body: the call sets state before its first await.
      void Promise.resolve().then(start);
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
      void Promise.resolve().then(resume);
    } else {
      void Promise.resolve().then(() => setState(openingView(ref)));
      startSession().catch(() => {});
    }
  }, [online, sessionOk, resume, ref]);

  useEffect(
    () => () => {
      runId.current += 1;
      clearTimeout(timer.current);
    },
    [],
  );

  const retry = useCallback(() => {
    if (sessionOk) {
      resume();
      return;
    }
    setState(openingView(ref));
    startSession()
      .then((answer) => {
        if (answer.status === 'refused') refuse('session_failed');
        else if (answer.status === 'offline') {
          waitingOnline.current = true;
          refuse('offline');
        }
      })
      .catch(() => refuse('session_failed'));
  }, [sessionOk, resume, refuse, ref]);

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
          void attempt(false);
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

  /** Join on Confirm: calls `join_room` now, with the link's own `link_opened_at`. */
  const join = useCallback(() => void attempt(true), [attempt]);

  const profile = useMyProfile(sessionOk);
  const view = deriveView(state, profile.isPending, profile.data);

  return {
    view,
    retry,
    join,
    submit,
    saving,
    nameError,
    clearNameError: () => setNameError(null),
    code: code ?? (typeof params.code === 'string' ? params.code : ''),
  };
}

/** Leaves the sheet for the room without ever stacking room screens (see `roomEntry`). */
function enterRoom(path: string, roomId: string, routes: readonly RootRoute[]) {
  const entry = roomEntry(routes, roomId);
  if (entry === 'dismissTo') {
    router.dismissTo(path as never);
  } else if (entry === 'reset') {
    router.dismissAll();
    router.replace(path as never);
  } else {
    router.replace(path as never);
  }
}

function refusedView(
  state: keyof typeof JOIN_SHEET_ROWS,
  params?: { max: number },
): Extract<LinkView, { kind: 'refused' }> {
  const row = JOIN_SHEET_ROWS[state];
  if (row.kind !== 'refused') throw new Error(`No refusal for ${state}`);
  return { kind: 'refused', row, message: row.message, params };
}

/** The first view: Joining for a link with no reference (it joins at once), else Loading. */
function openingView(ref: string | undefined): State {
  return ref ? { kind: 'loading' } : { kind: 'joining', shuffling: false };
}

/** The view while `join_room` runs: Confirm keeps its layout, anything else shows Joining. */
function waitView(host: JoinHost | null, keep: boolean, shuffling: boolean): State {
  if (keep && host) {
    return { kind: 'ready', host, needName: false, hostName: null, busy: true, shuffling };
  }
  return { kind: 'joining', shuffling };
}

/**
 * Confirm or First time, picked from the saved profile (an empty name gets First time), or
 * Loading while the profile is still being read. Nothing calls `join_room` before a tap.
 */
function deriveView(
  state: State,
  profilePending: boolean,
  profile: { display_name: string } | null | undefined,
): LinkView {
  if (state.kind !== 'ready') return state;
  if (profilePending && !state.needName) return { kind: 'loading' };
  // A profile that couldn't be read (`undefined`) is taken as named: `join_room` says otherwise.
  const unnamed = state.needName || profile === null || (!!profile && !profile.display_name.trim());
  if (unnamed) {
    return { kind: 'first-time', host: state.host, hostName: state.host?.name ?? state.hostName };
  }
  if (!state.host) return { kind: 'joining', shuffling: false };
  return { kind: 'confirm', host: state.host, busy: state.busy, shuffling: state.shuffling };
}
