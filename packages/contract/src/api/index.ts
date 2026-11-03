// One typed wrapper per `api` function (app-structure.md#talking-to-the-backend). Screens
// never call `.rpc` directly, so a `_v2` function is a one-file change. The names are
// camelCase, the single object argument keeps the SQL parameter names without `p_`, and
// results keep the SQL's snake_case fields. A status resolves as a value; only a real
// error rejects, as an ApiError. A PR that changes a wrapped function changes its answer
// list (answers.ts), its schema (payloads.ts) and its wrapper here.
import {
  CREATE_ROOM_ANSWERS,
  JOIN_ROOM_ANSWERS,
  ROOM_PREVIEW_ANSWERS,
  LEAVE_ROOM_ANSWERS,
  SET_MY_PROVIDERS_ANSWERS,
  SET_SEAT_PREFS_ANSWERS,
  START_GAME_ANSWERS,
  UPDATE_PROFILE_ANSWERS,
  UPDATE_ROOM_SETTINGS_ANSWERS,
  type JoinVia,
} from '../answers';
import {
  appConfigSchema,
  createRoomResult,
  joinRoomResult,
  roomPreviewResult,
  leaveRoomResult,
  myProfileRow,
  countryProvidersSchema,
  type CountryProvider,
  setMyProvidersResult,
  setSeatPrefsResult,
  startGameResult,
  updateProfileResult,
  updateRoomSettingsResult,
  type AppConfig,
  type CreateRoomResult,
  type JoinRoomResult,
  type RoomPreviewResult,
  type LeaveRoomResult,
  type MyProfile,
  type RoomSettings,
  type SetMyProvidersResult,
  type SetSeatPrefsResult,
  type StartGameResult,
  type UpdateProfileResult,
  type UpdateRoomSettingsResult,
} from '../payloads';
import { callAnswer, callVoid, readView, type ApiClient, type ApiOptions } from './call';
import { ApiError } from './errors';

export { ApiError, type ApiErrorKind } from './errors';
export type { ApiClient, ApiOptions } from './call';

export function createApi(client: ApiClient, options: ApiOptions = {}) {
  return {
    // --- Profile -------------------------------------------------------------------------
    updateProfile(args: {
      display_name?: string;
      avatar_key?: string;
      country?: string;
      language?: string;
    }): Promise<UpdateProfileResult> {
      return callAnswer(
        client,
        options,
        'update_profile',
        {
          p_display_name: args.display_name,
          p_avatar_key: args.avatar_key,
          p_country: args.country,
          p_language: args.language,
        },
        UPDATE_PROFILE_ANSWERS,
        updateProfileResult,
      );
    },

    setMyProviders(args: { provider_ids: number[] }): Promise<SetMyProvidersResult> {
      return callAnswer(
        client,
        options,
        'set_my_providers',
        { p_provider_ids: args.provider_ids },
        SET_MY_PROVIDERS_ANSWERS,
        setMyProvidersResult,
      );
    },

    // --- Rooms and lobby -----------------------------------------------------------------
    createRoom(
      args: { mode?: string; country?: string; settings?: RoomSettings } = {},
    ): Promise<CreateRoomResult> {
      return callAnswer(
        client,
        options,
        'create_room',
        { p_mode: args.mode, p_country: args.country, p_settings: args.settings },
        CREATE_ROOM_ANSWERS,
        createRoomResult,
      );
    },

    /** `ref` is the room id from an invite link; `link_opened_at` is only kept for `via` link. */
    joinRoom(args: {
      code: string;
      ref?: string;
      via?: JoinVia;
      link_opened_at?: string;
    }): Promise<JoinRoomResult> {
      return callAnswer(
        client,
        options,
        'join_room',
        {
          p_code: args.code,
          p_ref: args.ref,
          p_via: args.via,
          p_link_opened_at: args.link_opened_at,
        },
        JOIN_ROOM_ANSWERS,
        joinRoomResult,
      );
    },

    /** What a link tells before joining: the host and the count, never other players. Needs the link's `ref`. */
    roomPreview(args: { code: string; ref: string }): Promise<RoomPreviewResult> {
      return callAnswer(
        client,
        options,
        'room_preview',
        { p_code: args.code, p_ref: args.ref },
        ROOM_PREVIEW_ANSWERS,
        roomPreviewResult,
      );
    },

    leaveRoom(args: { room_id: string }): Promise<LeaveRoomResult> {
      return callAnswer(
        client,
        options,
        'leave_room',
        { p_room_id: args.room_id },
        LEAVE_ROOM_ANSWERS,
        leaveRoomResult,
      );
    },

    /** Marks the seat active. Returns nothing. */
    touchRoom(args: { room_id: string }): Promise<void> {
      return callVoid(client, 'touch_room', { p_room_id: args.room_id });
    },

    updateRoomSettings(args: {
      room_id: string;
      settings: RoomSettings;
    }): Promise<UpdateRoomSettingsResult> {
      return callAnswer(
        client,
        options,
        'update_room_settings',
        { p_room_id: args.room_id, p_settings: args.settings },
        UPDATE_ROOM_SETTINGS_ANSWERS,
        updateRoomSettingsResult,
      );
    },

    setSeatPrefs(args: {
      room_id: string;
      provider_ids?: number[];
      mood_slugs?: string[];
      genre_ids?: number[];
      member_id?: string;
    }): Promise<SetSeatPrefsResult> {
      return callAnswer(
        client,
        options,
        'set_seat_prefs',
        {
          p_room_id: args.room_id,
          p_provider_ids: args.provider_ids,
          p_mood_slugs: args.mood_slugs,
          p_genre_ids: args.genre_ids,
          p_member_id: args.member_id,
        },
        SET_SEAT_PREFS_ANSWERS,
        setSeatPrefsResult,
      );
    },

    startGame(args: { room_id: string }): Promise<StartGameResult> {
      return callAnswer(
        client,
        options,
        'start_game',
        { p_room_id: args.room_id },
        START_GAME_ANSWERS,
        startGameResult,
      );
    },

    // --- Views ---------------------------------------------------------------------------
    /** The signed-in player's profile, or null when there is none yet. */
    async myProfile(): Promise<MyProfile | null> {
      const rows = await readView(
        () => client.from('my_profile').select('*').limit(1),
        'my_profile',
      );
      const row = rows?.[0] ?? null;
      if (row && options.validate) {
        const parsed = myProfileRow.safeParse(row);
        if (!parsed.success) {
          throw new ApiError('unexpected', 'my_profile', `wrong shape: ${parsed.error.message}`);
        }
      }
      return row as MyProfile | null;
    },

    /** The services streaming in a country, most shown first. */
    async countryProviders(args: { country: string }): Promise<CountryProvider[]> {
      const rows = await readView(
        () =>
          client
            .from('country_providers')
            .select('provider_id, name, logo_path, display_priority')
            .eq('country', args.country)
            .order('display_priority'),
        'country_providers',
      );
      if (options.validate) {
        const parsed = countryProvidersSchema.safeParse(rows ?? []);
        if (!parsed.success) {
          throw new ApiError(
            'unexpected',
            'country_providers',
            `wrong shape: ${parsed.error.message}`,
          );
        }
        return parsed.data;
      }
      return (rows ?? []) as CountryProvider[];
    },

    /** The ids of the services the signed-in player has. */
    async myProviders(): Promise<number[]> {
      const rows = await readView(
        () => client.from('my_providers').select('provider_id'),
        'my_providers',
      );
      return (rows ?? []).map((r) => r.provider_id);
    },

    /** The `app_config` keys the app reads. Unknown keys are ignored, missing ones are undefined. */
    async appConfig(): Promise<AppConfig> {
      const rows = await readView(
        () => client.from('app_config').select('key, value'),
        'app_config',
      );
      const config = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
      if (options.validate) {
        const parsed = appConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new ApiError('unexpected', 'app_config', `wrong shape: ${parsed.error.message}`);
        }
        return parsed.data;
      }
      return config as AppConfig;
    },
  };
}

export type Api = ReturnType<typeof createApi>;
