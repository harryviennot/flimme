// One typed wrapper per `api` function (app-structure.md#talking-to-the-backend). Screens
// never call `.rpc` directly, so a `_v2` function is a one-file change. The names are
// camelCase, the single object argument keeps the SQL parameter names without `p_`, and
// results keep the SQL's snake_case fields. A status resolves as a value; only a real
// error rejects, as an ApiError. A PR that changes a wrapped function changes its answer
// list (answers.ts), its schema (payloads.ts) and its wrapper here.
import {
  CAST_BALLOT_ANSWERS,
  CAST_VOTE_ANSWERS,
  CLOSE_ROUND_STAGE_ANSWERS,
  ROUND_PROGRESS_ANSWERS,
  REQUEST_CARDS_ANSWERS,
  UNDO_LAST_VOTE_ANSWERS,
  CREATE_ROOM_ANSWERS,
  JOIN_ROOM_ANSWERS,
  ROOM_PREVIEW_ANSWERS,
  REPORT_MEMBER_ANSWERS,
  EXPORT_MY_DATA_ANSWERS,
  SET_ANALYTICS_CHOICE_ANSWERS,
  type AnalyticsChoice,
  LEAVE_ROOM_ANSWERS,
  REMOVE_MEMBER_ANSWERS,
  SET_ROOM_LOCKED_ANSWERS,
  PLAY_AGAIN_ANSWERS,
  ROOM_GENRES_ANSWERS,
  ROOM_RUNNERS_UP_ANSWERS,
  SET_MY_PROVIDERS_ANSWERS,
  SET_SEAT_PREFS_ANSWERS,
  SET_SEAT_SKIPS_ANSWERS,
  START_GAME_ANSWERS,
  START_SOLO_ANSWERS,
  SOLO_PICK_ANSWERS,
  TITLE_CARDS_ANSWERS,
  MY_FILMS_ANSWERS,
  MY_FILM_CARD_ANSWERS,
  SET_FILM_SEEN_ANSWERS,
  REMOVE_MY_FILM_ANSWERS,
  SET_FILM_SAVED_ANSWERS,
  SEARCH_PEOPLE_ANSWERS,
  type MyFilmsFilter,
  type MyFilmsSegment,
  UPDATE_PROFILE_ANSWERS,
  UPDATE_ROOM_SETTINGS_ANSWERS,
  type JoinVia,
  type ReportReason,
  type VoteAnswer,
} from '../answers';
import {
  appConfigSchema,
  castBallotResult,
  castVoteResult,
  closeRoundStageResult,
  roundProgressResult,
  type CastBallotResult,
  type CloseRoundStageResult,
  type RoundProgressResult,
  requestCardsResult,
  undoLastVoteResult,
  roomMatchRow,
  roomRoundRow,
  roundCandidateRow,
  type RoomRound,
  type RoundCandidate,
  type CastVoteResult,
  type RequestCardsResult,
  type UndoLastVoteResult,
  type RoomMatch,
  createRoomResult,
  joinRoomResult,
  roomPreviewResult,
  reportMemberResult,
  exportMyDataResult,
  setAnalyticsChoiceResult,
  type SetAnalyticsChoiceResult,
  type ExportMyDataResult,
  leaveRoomResult,
  removeMemberResult,
  setRoomLockedResult,
  playAgainResult,
  type PlayAgainResult,
  roomGenresResult,
  type RoomGenresResult,
  runnersUpResult,
  type RunnersUpResult,
  myProfileRow,
  roomRow,
  roomSeatRow,
  countryProvidersSchema,
  catalogCountriesSchema,
  type CatalogCountry,
  gameModesSchema,
  myNextCardsResult,
  titleCardsResult,
  myFilmsResult,
  myFilmCardResult,
  myFilmEditResult,
  searchPeopleResult,
  type MyFilmsResult,
  type MyFilmCardResult,
  type MyFilmEditResult,
  type SearchPeopleResult,
  type NextCard,
  type TitleCardsResult,
  type CountryProvider,
  type GameMode,
  type Genre,
  setMyProvidersResult,
  genresSchema,
  setSeatPrefsResult,
  setSeatSkipsResult,
  startGameResult,
  startSoloResult,
  soloPickResult,
  updateProfileResult,
  updateRoomSettingsResult,
  type AppConfig,
  type CreateRoomResult,
  type JoinRoomResult,
  type RoomPreviewResult,
  type ReportMemberResult,
  type LeaveRoomResult,
  type RemoveMemberResult,
  type SetRoomLockedResult,
  type MyProfile,
  type RoomRow,
  type RoomSeat,
  type RoomSettings,
  type SetMyProvidersResult,
  type SetSeatPrefsResult,
  type SetSeatSkipsResult,
  type StartGameResult,
  type StartSoloResult,
  type SoloPickResult,
  type UpdateProfileResult,
  type UpdateRoomSettingsResult,
} from '../payloads';
import { callAnswer, callJson, callVoid, readView, type ApiClient, type ApiOptions } from './call';
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

    /** Reports another seat of the room. Nobody but the reporter is told. */
    reportMember(args: {
      room_id: string;
      member_id: string;
      reason: ReportReason;
    }): Promise<ReportMemberResult> {
      return callAnswer(
        client,
        options,
        'report_member',
        { p_room_id: args.room_id, p_member_id: args.member_id, p_reason: args.reason },
        REPORT_MEMBER_ANSWERS,
        reportMemberResult,
      );
    },

    /** "Download my data": the caller's own data only. One an hour; `rate_limited` is an answer. */
    exportMyData(): Promise<ExportMyDataResult> {
      return callAnswer(
        client,
        options,
        'export_my_data',
        {},
        EXPORT_MY_DATA_ANSWERS,
        exportMyDataResult,
      );
    },

    /** The analytics choice with its wording version (1 to 40 characters). `invalid` and `rate_limited` are answers. */
    setAnalyticsChoice(args: {
      choice: AnalyticsChoice;
      version: string;
    }): Promise<SetAnalyticsChoiceResult> {
      return callAnswer(
        client,
        options,
        'set_analytics_choice',
        { p_choice: args.choice, p_version: args.version },
        SET_ANALYTICS_CHOICE_ANSWERS,
        setAnalyticsChoiceResult,
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

    /** Host only: the seat stops counting and cannot come back (M4.2). */
    removeMember(args: { room_id: string; member_id: string }): Promise<RemoveMemberResult> {
      return callAnswer(
        client,
        options,
        'remove_member',
        { p_room_id: args.room_id, p_member_id: args.member_id },
        REMOVE_MEMBER_ANSWERS,
        removeMemberResult,
      );
    },

    /** Host only: no new seats while locked; players with a seat can still come back (M4.23). */
    setRoomLocked(args: { room_id: string; locked: boolean }): Promise<SetRoomLockedResult> {
      return callAnswer(
        client,
        options,
        'set_room_locked',
        { p_room_id: args.room_id, p_locked: args.locked },
        SET_ROOM_LOCKED_ANSWERS,
        setRoomLockedResult,
      );
    },

    /**
     * Host only, once the room is done or abandoned: opens the next room with the same settings
     * and sends `next_room` on this room's topic. A repeat returns the open next room (M6.22).
     */
    playAgain(args: { room_id: string }): Promise<PlayAgainResult> {
      return callAnswer(
        client,
        options,
        'play_again',
        { p_room_id: args.room_id },
        PLAY_AGAIN_ANSWERS,
        playAgainResult,
      );
    },

    /**
     * After the pick: the other finalists, or the most liked films after a single match. Party
     * names who liked each, Blind has counts only. Before the pick: not_finished (M6.48).
     */
    roomRunnersUp(args: { room_id: string }): Promise<RunnersUpResult> {
      return callAnswer(
        client,
        options,
        'room_runners_up',
        { p_room_id: args.room_id },
        ROOM_RUNNERS_UP_ANSWERS,
        runnersUpResult,
      );
    },

    /**
     * Tonight's genres with how many present seats picked each, and the caller's own picks. Read it
     * again on `genres_changed`. Still answers after Start, with the locked picks (M6.53).
     */
    roomGenres(args: { room_id: string }): Promise<RoomGenresResult> {
      return callAnswer(
        client,
        options,
        'room_genres',
        { p_room_id: args.room_id },
        ROOM_GENRES_ANSWERS,
        roomGenresResult,
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

    /**
     * Not tonight for one seat (M6.68): up to 3 genres and 3 people to leave out of every deck. A list
     * left out stays as it is; an empty one clears. Lobby only. A call that changes genres sends
     * `genres_changed`; people never reach another phone.
     */
    setSeatSkips(args: {
      room_id: string;
      genre_ids?: number[];
      person_ids?: number[];
      member_id?: string;
    }): Promise<SetSeatSkipsResult> {
      return callAnswer(
        client,
        options,
        'set_seat_skips',
        {
          p_room_id: args.room_id,
          p_genre_ids: args.genre_ids,
          p_person_ids: args.person_ids,
          p_member_id: args.member_id,
        },
        SET_SEAT_SKIPS_ANSWERS,
        setSeatSkipsResult,
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

    /**
     * Opens and starts a solo room in one call (M6.40): one seat, no lobby, no code to share. The
     * caller's other live solo room ends first. Settings are checked as `createRoom` checks them,
     * and `seen_rule` is always `hide_seen`.
     */
    startSolo(args: { settings?: RoomSettings } = {}): Promise<StartSoloResult> {
      return callAnswer(
        client,
        options,
        'start_solo',
        { p_settings: args.settings },
        START_SOLO_ANSWERS,
        startSoloResult,
      );
    },

    /** Picks a film the seat liked in a solo room as tonight's pick and ends the room (M6.40). */
    soloPick(args: { room_id: string; title_id: number }): Promise<SoloPickResult> {
      return callAnswer(
        client,
        options,
        'solo_pick',
        { p_room_id: args.room_id, p_title_id: args.title_id },
        SOLO_PICK_ANSWERS,
        soloPickResult,
      );
    },

    /**
     * The seat's next cards, each ready to render front and back (up to 30, in deck order).
     * An array with no status; a removed seat gets an empty one.
     */
    myNextCards(args: {
      room_id: string;
      limit?: number;
      member_id?: string;
      language?: string;
    }): Promise<NextCard[]> {
      return callJson(
        client,
        options,
        'my_next_cards',
        {
          p_room_id: args.room_id,
          p_limit: args.limit,
          p_member_id: args.member_id,
          p_language: args.language,
        },
        myNextCardsResult,
      );
    },

    /**
     * Cards for films in the room's pool (the winner screen, the finale), in the order asked. Films
     * outside the pool are left out. A seat that was removed, or no seat, rejects as denied.
     */
    titleCards(args: {
      room_id: string;
      title_ids: number[];
      language?: string;
    }): Promise<TitleCardsResult> {
      return callAnswer(
        client,
        options,
        'title_cards',
        { p_room_id: args.room_id, p_title_ids: args.title_ids, p_language: args.language },
        TITLE_CARDS_ANSWERS,
        titleCardsResult,
      );
    },

    // --- My films (M6.41): the caller's own film history, outside any room ---------------
    /**
     * A page of Liked or Seen films, newest first, 60 a page. `filter` (all, friends, solo) only
     * applies to `liked`. Pass the last `next_cursor` back for the next page. Opening it counts as
     * activity. A bad segment, filter or cursor rejects.
     */
    myFilms(args: {
      segment: MyFilmsSegment;
      filter?: MyFilmsFilter;
      cursor?: string | null;
      language?: string;
    }): Promise<MyFilmsResult> {
      return callAnswer(
        client,
        options,
        'my_films',
        {
          p_segment: args.segment,
          p_filter: args.filter ?? 'all',
          p_cursor: args.cursor ?? undefined,
          p_language: args.language,
        },
        MY_FILMS_ANSWERS,
        myFilmsResult,
      );
    },

    /**
     * The film sheet's card for a film in the caller's own rows, with `seen` and `liked` so the sheet
     * can offer Mark as seen or Not seen, and Remove only for liked films. `not_found` for any other
     * film. 60 calls per 10 minutes.
     */
    myFilmCard(args: { title_id: number; language?: string }): Promise<MyFilmCardResult> {
      return callAnswer(
        client,
        options,
        'my_film_card',
        { p_title_id: args.title_id, p_language: args.language },
        MY_FILM_CARD_ANSWERS,
        myFilmCardResult,
      );
    },

    /** Mark a film seen (only one already in the caller's rows) or not seen. `not_found` is an answer. */
    setFilmSeen(args: { title_id: number; seen: boolean }): Promise<MyFilmEditResult> {
      return callAnswer(
        client,
        options,
        'set_film_seen',
        { p_title_id: args.title_id, p_seen: args.seen },
        SET_FILM_SEEN_ANSWERS,
        myFilmEditResult,
      );
    },

    /** Take a film out of Liked (the like, the star and the pick); the seen mark stays. */
    removeMyFilm(args: { title_id: number }): Promise<MyFilmEditResult> {
      return callAnswer(
        client,
        options,
        'remove_my_film',
        { p_title_id: args.title_id },
        REMOVE_MY_FILM_ANSWERS,
        myFilmEditResult,
      );
    },

    /**
     * The bookmark: save a film as a solo like (only one dealt to the caller, or already in their rows),
     * or unsave it. Not an answer: it counts for nothing in the room. Saving a film already liked or saved
     * is `ok` and changes nothing; unsaving takes back only a like a save made. `not_found` is an answer.
     */
    setFilmSaved(args: { title_id: number; saved: boolean }): Promise<MyFilmEditResult> {
      return callAnswer(
        client,
        options,
        'set_film_saved',
        { p_title_id: args.title_id, p_saved: args.saved },
        SET_FILM_SAVED_ANSWERS,
        myFilmEditResult,
      );
    },

    // --- People search ---------------------------------------------------------------------
    /**
     * Find a director or an actor by part of their name (Not tonight, M6.69): up to 8 people, closest
     * name first, each with one film they're known for and no photo. `invalid` is a query outside 2 to
     * 60 characters once trimmed; `rate_limited` is 60 calls a minute. A POST on purpose: the query
     * must never sit in a URL, where a proxy log could keep it.
     */
    searchPeople(args: { query: string; language?: string }): Promise<SearchPeopleResult> {
      return callAnswer(
        client,
        options,
        'search_people',
        { p_query: args.query, p_language: args.language },
        SEARCH_PEOPLE_ANSWERS,
        searchPeopleResult,
      );
    },

    // --- Swiping -------------------------------------------------------------------------
    /**
     * One answer to one film. `client_at` is the phone's time at the swipe (ISO), `dwell_ms` how
     * long the card was on screen. Safe to send twice: a saved vote answers `duplicate`.
     */
    castVote(args: {
      room_id: string;
      title_id: number;
      answer: VoteAnswer;
      member_id?: string;
      dwell_ms?: number;
      client_at?: string;
      /** Whether the card was turned over before the answer (M6.2). */
      flipped?: boolean;
    }): Promise<CastVoteResult> {
      return callAnswer(
        client,
        options,
        'cast_vote',
        {
          p_room_id: args.room_id,
          p_title_id: args.title_id,
          p_answer: args.answer,
          p_member_id: args.member_id,
          p_dwell_ms: args.dwell_ms,
          p_client_at: args.client_at,
          p_flipped: args.flipped,
        },
        CAST_VOTE_ANSWERS,
        castVoteResult,
      );
    },

    /** Asks for more cards when the seat is running low. `enough` says how many are left. */
    requestCards(args: { room_id: string; member_id?: string }): Promise<RequestCardsResult> {
      return callAnswer(
        client,
        options,
        'request_cards',
        { p_room_id: args.room_id, p_member_id: args.member_id },
        REQUEST_CARDS_ANSWERS,
        requestCardsResult,
      );
    },

    /** Takes back the seat's last vote while its card is still active. */
    undoLastVote(args: { room_id: string; member_id?: string }): Promise<UndoLastVoteResult> {
      return callAnswer(
        client,
        options,
        'undo_last_vote',
        { p_room_id: args.room_id, p_member_id: args.member_id },
        UNDO_LAST_VOTE_ANSWERS,
        undoLastVoteResult,
      );
    },

    // --- The Final Cut -------------------------------------------------------------------
    /**
     * The whole ballot in one call: every film of the round in order, minus the vetoed one. Final
     * Cut only; a ranked vote has no veto. A ballot can't be changed afterwards.
     */
    castBallot(args: {
      round_id: string;
      ranking: number[];
      veto?: number;
      member_id?: string;
    }): Promise<CastBallotResult> {
      return callAnswer(
        client,
        options,
        'cast_ballot',
        {
          p_round_id: args.round_id,
          p_ranking: args.ranking,
          p_veto: args.veto,
          p_member_id: args.member_id,
        },
        CAST_BALLOT_ANSWERS,
        castBallotResult,
      );
    },

    /** Every phone calls this at zero; it closes the round only when it is time, and is safe to repeat. */
    closeRoundStage(args: { round_id: string }): Promise<CloseRoundStageResult> {
      return callAnswer(
        client,
        options,
        'close_round_stage',
        { p_round_id: args.round_id },
        CLOSE_ROUND_STAGE_ANSWERS,
        closeRoundStageResult,
      );
    },

    /** Who has locked in, out of how many present, for a phone that restarted. */
    roundProgress(args: { round_id: string }): Promise<RoundProgressResult> {
      return callAnswer(
        client,
        options,
        'round_progress',
        { p_round_id: args.round_id },
        ROUND_PROGRESS_ANSWERS,
        roundProgressResult,
      );
    },

    // --- Views ---------------------------------------------------------------------------
    /** The films the room has matched on, in the order they were found. */
    async roomMatches(args: { room_id: string }): Promise<RoomMatch[]> {
      const rows = await readView(
        () =>
          client.from('room_matches').select('*').eq('room_id', args.room_id).order('created_at'),
        'room_matches',
      );
      if (options.validate) {
        for (const row of rows ?? []) {
          const parsed = roomMatchRow.safeParse(row);
          if (!parsed.success) {
            throw new ApiError(
              'unexpected',
              'room_matches',
              `wrong shape: ${parsed.error.message}`,
            );
          }
        }
      }
      return (rows ?? []) as RoomMatch[];
    },

    /** The room's rounds (Final Cut, ranked vote), oldest first. Empty for a room that never had one. */
    async rounds(args: { room_id: string }): Promise<RoomRound[]> {
      const rows = await readView(
        () => client.from('rounds').select('*').eq('room_id', args.room_id).order('seq'),
        'rounds',
      );
      if (options.validate) {
        for (const row of rows ?? []) {
          const parsed = roomRoundRow.safeParse(row);
          if (!parsed.success) {
            throw new ApiError('unexpected', 'rounds', `wrong shape: ${parsed.error.message}`);
          }
        }
      }
      return (rows ?? []) as RoomRound[];
    },

    /** The finalists of a round, by seed (the order the cards are shown in). */
    async roundCandidates(args: { round_id: string }): Promise<RoundCandidate[]> {
      const rows = await readView(
        () =>
          client.from('round_candidates').select('*').eq('round_id', args.round_id).order('seed'),
        'round_candidates',
      );
      if (options.validate) {
        for (const row of rows ?? []) {
          const parsed = roundCandidateRow.safeParse(row);
          if (!parsed.success) {
            throw new ApiError(
              'unexpected',
              'round_candidates',
              `wrong shape: ${parsed.error.message}`,
            );
          }
        }
      }
      return (rows ?? []) as RoundCandidate[];
    },

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

    /** The room, as a member sees it. Null when the view returns no row: not a member, or a removed seat. */
    async room(args: { room_id: string }): Promise<RoomRow | null> {
      const rows = await readView(
        () => client.from('rooms').select('*').eq('id', args.room_id).limit(1),
        'rooms',
      );
      const row = rows?.[0] ?? null;
      if (row && options.validate) {
        const parsed = roomRow.safeParse(row);
        if (!parsed.success) {
          throw new ApiError('unexpected', 'rooms', `wrong shape: ${parsed.error.message}`);
        }
      }
      return row as RoomRow | null;
    },

    /** Every seat of the room, oldest first, including seats that left (`left_at` is set). */
    async roomSeats(args: { room_id: string }): Promise<RoomSeat[]> {
      const rows = await readView(
        () =>
          client
            .from('room_seats')
            .select('*')
            .eq('room_id', args.room_id)
            .order('joined_at')
            .order('member_id'),
        'room_seats',
      );
      if (options.validate) {
        for (const row of rows ?? []) {
          const parsed = roomSeatRow.safeParse(row);
          if (!parsed.success) {
            throw new ApiError('unexpected', 'room_seats', `wrong shape: ${parsed.error.message}`);
          }
        }
      }
      return (rows ?? []) as RoomSeat[];
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

    /** The countries that have a catalog, by code (the country choice). */
    async catalogCountries(): Promise<CatalogCountry[]> {
      const rows = await readView(
        () => client.from('catalog_countries').select('code, default_language').order('code'),
        'catalog_countries',
      );
      if (options.validate) {
        const parsed = catalogCountriesSchema.safeParse(rows ?? []);
        if (!parsed.success) {
          throw new ApiError(
            'unexpected',
            'catalog_countries',
            `wrong shape: ${parsed.error.message}`,
          );
        }
        return parsed.data;
      }
      return (rows ?? []) as CatalogCountry[];
    },

    /** The TMDB genres with their French and English names. */
    async genres(): Promise<Genre[]> {
      const rows = await readView(
        () => client.from('genres').select('id, slug, names').order('id'),
        'genres',
      );
      if (options.validate) {
        const parsed = genresSchema.safeParse(rows ?? []);
        if (!parsed.success) {
          throw new ApiError('unexpected', 'genres', `wrong shape: ${parsed.error.message}`);
        }
        return parsed.data;
      }
      return (rows ?? []) as unknown as Genre[];
    },

    /** The game modes and their player limits, in display order. */
    async gameModes(): Promise<GameMode[]> {
      const rows = await readView(
        () =>
          client
            .from('game_modes')
            .select('slug, min_players, max_players, ends_on_first_match, sort, matches_to_end')
            .order('sort'),
        'game_modes',
      );
      if (options.validate) {
        const parsed = gameModesSchema.safeParse(rows ?? []);
        if (!parsed.success) {
          throw new ApiError('unexpected', 'game_modes', `wrong shape: ${parsed.error.message}`);
        }
        return parsed.data;
      }
      return (rows ?? []) as GameMode[];
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
