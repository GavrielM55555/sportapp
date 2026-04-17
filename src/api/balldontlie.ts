import { Game, Team, PlayoffSeries } from '../types';

const BASE_URL = 'https://api.balldontlie.io/v1';
const API_KEY = process.env.EXPO_PUBLIC_BALLDONTLIE_API_KEY!;

const headers = { Authorization: API_KEY };

// ── Current NBA season (Oct-Dec = current year, Jan-Sep = previous year) ──
export function currentNBASeason(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── Raw API helper (supports array params via arrays in value) ─────────────
async function get<T>(path: string, params: Record<string, string | number | string[] | number[]> = {}): Promise<T> {
  // Build query string manually to avoid URL-encoding the [] brackets
  const parts: string[] = [];
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((item) => parts.push(`${k}[]=${encodeURIComponent(String(item))}`));
    } else {
      parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  });
  const fullUrl = `${BASE_URL}${path}${parts.length ? '?' + parts.join('&') : ''}`;

  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`balldontlie ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Type mappers ─────────────────────────────────────────────────────────

function mapTeam(raw: any): Team {
  return {
    id: raw.id,
    name: raw.name,
    abbreviation: raw.abbreviation,
    city: raw.city,
    conference: raw.conference,
    division: raw.division,
  };
}

function mapGame(raw: any): Game {
  const s: string = raw.status ?? '';
  // Only mark live if the status explicitly says a quarter/half/OT is in progress
  const isLive = /Qtr|Half|OT|quarter|half/i.test(s);
  const isFinal = s === 'Final' || s === 'Final/OT';
  const status: Game['status'] = isFinal ? 'final' : isLive ? 'live' : 'scheduled';

  // Parse game time — status may be an ISO timestamp for scheduled games
  let gameTime: string | undefined;
  if (!isFinal && !isLive) {
    if (s.includes('T') && s.includes('Z')) {
      // ISO timestamp → convert to local time string
      try {
        gameTime = new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      } catch { gameTime = s; }
    } else if (s.length > 0) {
      gameTime = s;
    } else {
      gameTime = raw.time ?? undefined;
    }
  }


  return {
    id: raw.id,
    date: raw.date,
    homeTeam: mapTeam(raw.home_team),
    awayTeam: mapTeam(raw.visitor_team),
    homeScore: raw.home_team_score ?? null,
    awayScore: raw.visitor_team_score ?? null,
    status,
    isOT: s === 'Final/OT',
    period: raw.period || undefined,
    time: gameTime,
    playoffs: raw.postseason ?? false,
    playoffRound: undefined,
    seriesId: undefined,
  };
}

// ── Shared global cache keyed by ET date range ────────────────────────────
const CACHE_TTL = 5 * 60_000; // 5 minutes
export const rangeCache = new Map<string, { games: Game[]; ts: number }>();

/** Returns ET date string for a JS Date */
function toET(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Fetch games for a date range, cached by ET range key */
async function fetchRange(start: string, end: string): Promise<Game[]> {
  const key = `${start}::${end}`;
  const cached = rangeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.games;

  const data = await get<{ data: any[] }>('/games', { start_date: start, end_date: end, per_page: 100 });
  const games = data.data.map(mapGame);
  rangeCache.set(key, { games, ts: Date.now() });
  return games;
}

// ── Public API ────────────────────────────────────────────────────────────

// Pre-warm: fetch a wide window (7 days back, 14 days forward) once on first call
// so all date navigation is served from cache with no extra calls
let prewarmDone = false;
async function prewarm() {
  if (prewarmDone) return;
  prewarmDone = true;
  const now = new Date();
  const start = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const end = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
  await fetchRange(start, end);
}

/** Get games for specific dates.
 *  Converts local dates to ET, fetches from cache (prewarmed on first call).
 *  Pass forceRefresh=true to bypass cache and fetch fresh (used for live score updates). */
export async function getGamesByDates(dates: string[], forceRefresh = false): Promise<Game[]> {
  await prewarm();
  const sorted = [...dates].sort();
  const etDates = sorted.map(d => toET(new Date(d + 'T12:00:00')));
  const start = etDates[0];
  const end = etDates[etDates.length - 1];

  if (forceRefresh) {
    // Fetch just this date range directly (1 API call), then patch the prewarm cache
    const data = await get<{ data: any[] }>('/games', { start_date: start, end_date: end, per_page: 100 });
    const freshGames = data.data.map(mapGame);
    const prewarmKey = (() => {
      const now = new Date();
      const s = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
      const e = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
      return `${s}::${e}`;
    })();
    const cached = rangeCache.get(prewarmKey);
    if (cached) {
      // Replace today's games in the cached range with fresh data
      const merged = cached.games.filter(g => g.date < start || g.date > end).concat(freshGames);
      rangeCache.set(prewarmKey, { games: merged, ts: cached.ts });
    }
    return freshGames;
  }

  // If within prewarmed range, filter from it
  const prewarmKey = (() => {
    const now = new Date();
    const s = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    const e = toET(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
    return `${s}::${e}`;
  })();
  const cached = rangeCache.get(prewarmKey);
  if (cached) {
    return cached.games.filter(g => g.date >= start && g.date <= end);
  }
  return fetchRange(start, end);
}

/** Get today's games */
export async function getTodayGames(): Promise<Game[]> {
  const today = new Date().toISOString().split('T')[0];
  return getGamesByDates([today]);
}

/** Get upcoming games (next 7 days) */
export async function getUpcomingGames(): Promise<Game[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return getGamesByDates(dates);
}

/** Get playoff games for a season — paginates to get all games */
export const playoffCache = new Map<number, { games: Game[]; ts: number }>();
const PLAYOFF_CACHE_TTL = 5 * 60_000; // 5 minutes

export async function getPlayoffGames(season?: number): Promise<Game[]> {
  const s = season ?? currentNBASeason();

  const cached = playoffCache.get(s);
  if (cached && Date.now() - cached.ts < PLAYOFF_CACHE_TTL) return cached.games;

  const allGames: Game[] = [];
  let cursor: number | undefined;

  while (true) {
    const params: Record<string, string | number | string[] | number[]> = {
      seasons: [s],
      postseason: 'true',
      per_page: 100,
    };
    if (cursor !== undefined) params.cursor = cursor;

    const data = await get<{ data: any[]; meta?: { next_cursor?: number } }>('/games', params);
    allGames.push(...data.data.map(mapGame));

    const nextCursor = data.meta?.next_cursor;
    if (!nextCursor || data.data.length === 0) break;
    cursor = nextCursor;
  }

  playoffCache.set(s, { games: allGames, ts: Date.now() });
  return allGames;
}

/** Group playoff games into series.
 *  Same two teams can meet in multiple rounds — split into separate series
 *  whenever wins reset (i.e. a team reaches 4 wins, new series starts). */
export function groupIntoSeries(games: Game[]): PlayoffSeries[] {
  // First group all games by team pair
  const pairMap = new Map<string, Game[]>();
  games.forEach((game) => {
    const key = [game.homeTeam.id, game.awayTeam.id].sort().join('-');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(game);
  });

  const series: PlayoffSeries[] = [];

  pairMap.forEach((pairGames) => {
    const sorted = pairGames.sort((a, b) => a.date.localeCompare(b.date));

    // Split into individual series — a series ends when either team reaches 4 wins
    let chunk: Game[] = [];

    const pushSeries = (chunkGames: Game[], roundIndex: number) => {
      if (chunkGames.length === 0) return;
      const first = chunkGames[0];
      // Use first game's home/away as the "canonical" team assignment for display
      const homeTeam = first.homeTeam;
      const awayTeam = first.awayTeam;

      // Count wins per team ID (home/away rotates game by game)
      const winsById = new Map<number, number>();
      chunkGames.forEach(g => {
        if (g.status === 'final' && g.homeScore !== null && g.awayScore !== null) {
          const winnerId = g.homeScore > g.awayScore ? g.homeTeam.id : g.awayTeam.id;
          winsById.set(winnerId, (winsById.get(winnerId) ?? 0) + 1);
        }
      });
      const homeWins = winsById.get(homeTeam.id) ?? 0;
      const awayWins = winsById.get(awayTeam.id) ?? 0;
      const isComplete = homeWins === 4 || awayWins === 4;
      series.push({
        id: `${[homeTeam.id, awayTeam.id].sort().join('-')}-r${roundIndex}`,
        season: String(currentNBASeason()),
        round: 'first_round',
        homeTeam,
        awayTeam,
        homeWins,
        awayWins,
        isComplete,
        winner: isComplete ? (homeWins === 4 ? homeTeam : awayTeam) : undefined,
        totalGames: isComplete ? homeWins + awayWins : undefined,
        games: chunkGames,
      });
    };

    // Split chunks by team wins (track per team ID, not home/away)
    const winsInChunk = new Map<number, number>();
    let roundIndex = 0;
    for (const game of sorted) {
      chunk.push(game);
      if (game.status === 'final' && game.homeScore !== null && game.awayScore !== null) {
        const winnerId = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
        winsInChunk.set(winnerId, (winsInChunk.get(winnerId) ?? 0) + 1);
        const maxWins = Math.max(...winsInChunk.values());
        if (maxWins === 4) {
          pushSeries(chunk, roundIndex++);
          chunk = []; winsInChunk.clear();
        }
      }
    }
    if (chunk.length > 0) pushSeries(chunk, roundIndex);
  });

  return series;
}

/** Get all NBA teams */
export async function getTeams(): Promise<Team[]> {
  const data = await get<{ data: any[] }>('/teams', { per_page: 30 });
  return data.data.map(mapTeam);
}

/** Search players by name */
export async function searchPlayers(search: string): Promise<any[]> {
  const data = await get<{ data: any[] }>('/players', { search, per_page: 10 });
  return data.data;
}
