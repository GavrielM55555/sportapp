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

  console.log('[API]', fullUrl);

  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error('[API error]', res.status, text);
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

  // Use the status string as the game time when scheduled
  const gameTime = !isFinal && !isLive && s.length > 0 ? s : raw.time ?? undefined;

  console.log(`[mapGame] id=${raw.id} status="${s}" → ${status}`);

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

// ── Cache ─────────────────────────────────────────────────────────────────
const gamesCache = new Map<string, { games: Game[]; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

/** Convert a local date string to US Eastern Time date string (YYYY-MM-DD).
 *  balldontlie stores games under their ET date, so we must query in ET. */
function toETDateString(localDateStr: string): string {
  // Use noon on the local date to avoid DST edge cases
  const d = new Date(localDateStr + 'T12:00:00');
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ── Public API ────────────────────────────────────────────────────────────

/** Get games for one date or a range of dates — single API call.
 *  Dates are local (user's timezone); converted to ET for the query. */
export async function getGamesByDates(dates: string[]): Promise<Game[]> {
  const sorted = [...dates].sort();
  // Convert to ET — also include the day before the earliest date to catch
  // games that started the previous ET day but are "tonight" for users east of ET
  const etDates = sorted.map(toETDateString);
  const prevDay = new Date(sorted[0] + 'T12:00:00');
  prevDay.setDate(prevDay.getDate() - 1);
  const prevET = toETDateString(prevDay.toISOString().split('T')[0]);
  const allET = [...new Set([prevET, ...etDates])].sort();
  const start = allET[0];
  const end = allET[allET.length - 1];

  const cacheKey = `${start}::${end}`;
  const cached = gamesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL && cached.games.length > 0) {
    return cached.games;
  }

  const data = await get<{ data: any[] }>('/games', {
    start_date: start,
    end_date: end,
    per_page: 100,
  });
  console.log(`[API] ${start}→${end}: ${data.data.length} games`);
  const games = data.data.map(mapGame);
  if (games.length > 0) {
    gamesCache.set(cacheKey, { games, ts: Date.now() });
  }
  return games;
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

/** Get playoff games for a season */
export async function getPlayoffGames(season?: number): Promise<Game[]> {
  const s = season ?? currentNBASeason();
  const data = await get<{ data: any[] }>('/games', {
    seasons: [s],       // will become seasons[]=2025
    postseason: 'true',
    per_page: 100,
  });
  return data.data.map(mapGame);
}

/** Group playoff games into series */
export function groupIntoSeries(games: Game[]): PlayoffSeries[] {
  const seriesMap = new Map<string, Game[]>();

  games.forEach((game) => {
    const key = [game.homeTeam.id, game.awayTeam.id].sort().join('-');
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push(game);
  });

  const series: PlayoffSeries[] = [];

  seriesMap.forEach((seriesGames) => {
    const sorted = seriesGames.sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const homeTeam = first.homeTeam;
    const awayTeam = first.awayTeam;

    let homeWins = 0;
    let awayWins = 0;

    sorted.forEach((g) => {
      if (g.status === 'final' && g.homeScore !== null && g.awayScore !== null) {
        if (g.homeScore > g.awayScore) homeWins++;
        else awayWins++;
      }
    });

    const isComplete = homeWins === 4 || awayWins === 4;

    series.push({
      id: [homeTeam.id, awayTeam.id].sort().join('-'),
      season: String(currentNBASeason()),
      round: 'first_round',
      homeTeam,
      awayTeam,
      homeWins,
      awayWins,
      isComplete,
      winner: isComplete ? (homeWins === 4 ? homeTeam : awayTeam) : undefined,
      totalGames: isComplete ? homeWins + awayWins : undefined,
      games: sorted,
    });
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
