const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY!;

const headers = {
  'x-apisports-key': API_KEY,
};

// ── Leagues we support ────────────────────────────────────────────────────
export const SUPPORTED_LEAGUES: FootballLeague[] = [
  { id: 39,  name: 'Premier League',    country: 'England',  logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 140, name: 'La Liga',           country: 'Spain',    logo: '🇪🇸' },
  { id: 78,  name: 'Bundesliga',        country: 'Germany',  logo: '🇩🇪' },
  { id: 135, name: 'Serie A',           country: 'Italy',    logo: '🇮🇹' },
  { id: 61,  name: 'Ligue 1',           country: 'France',   logo: '🇫🇷' },
  { id: 2,   name: 'Champions League',  country: 'Europe',   logo: '⭐' },
  { id: 1,   name: 'World Cup',         country: 'World',    logo: '🌍' },
];

export interface FootballLeague {
  id: number;
  name: string;
  country: string;
  logo: string;
}

export interface FootballTeam {
  id: number;
  name: string;
  shortName: string;
  logo: string;
}

export type FootballStatus = 'scheduled' | 'live' | 'final';

export interface FootballGame {
  id: number;
  leagueId: number;
  leagueName: string;
  date: string;         // ISO date string YYYY-MM-DD
  time: string;         // e.g. "20:45"
  homeTeam: FootballTeam;
  awayTeam: FootballTeam;
  homeScore: number | null;
  awayScore: number | null;
  status: FootballStatus;
  statusDetail: string; // raw status e.g. "HT", "45+2", "FT"
  elapsed?: number;     // minutes played
}

// ── Cache ─────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const parts = Object.entries(params).map(
    ([k, v]) => `${k}=${encodeURIComponent(String(v))}`
  );
  const url = `${BASE_URL}${path}${parts.length ? '?' + parts.join('&') : ''}`;
  const cacheKey = url;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;

  console.log('[API-Football]', url);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`api-football ${res.status}: ${text}`);
  }
  const data = await res.json();

  // API-Football returns errors as an object when there are errors, empty array when none
  if (data.errors && !Array.isArray(data.errors) && Object.keys(data.errors).length > 0) {
    throw new Error(`api-football error: ${JSON.stringify(data.errors)}`);
  }

  cache.set(cacheKey, { data, ts: Date.now() });
  return data as T;
}

// ── Mappers ───────────────────────────────────────────────────────────────

function mapStatus(short: string): FootballStatus {
  // Final statuses
  if (['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(short)) return 'final';
  // Live statuses
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(short)) return 'live';
  // Everything else = scheduled
  return 'scheduled';
}

function mapGame(raw: any, leagueId: number, leagueName: string): FootballGame {
  const short = raw.fixture?.status?.short ?? '';
  return {
    id: raw.fixture.id,
    leagueId,
    leagueName,
    date: raw.fixture.date?.split('T')[0] ?? '',
    time: raw.fixture.date?.split('T')[1]?.substring(0, 5) ?? '',
    homeTeam: {
      id: raw.teams.home.id,
      name: raw.teams.home.name,
      shortName: raw.teams.home.name.substring(0, 3).toUpperCase(),
      logo: raw.teams.home.logo,
    },
    awayTeam: {
      id: raw.teams.away.id,
      name: raw.teams.away.name,
      shortName: raw.teams.away.name.substring(0, 3).toUpperCase(),
      logo: raw.teams.away.logo,
    },
    homeScore: raw.goals.home,
    awayScore: raw.goals.away,
    status: mapStatus(short),
    statusDetail: short,
    elapsed: raw.fixture?.status?.elapsed ?? undefined,
  };
}

// ── Major tournaments we surface in the Events tab ───────────────────────
export const MAJOR_EVENT_IDS: Record<number, { emoji: string; accentColor: string }> = {
  1:   { emoji: '🌍', accentColor: '#22c55e' }, // World Cup
  2:   { emoji: '⭐', accentColor: '#3b82f6' }, // Champions League
  4:   { emoji: '🇪🇺', accentColor: '#8b5cf6' }, // Euro Championship
  9:   { emoji: '🌎', accentColor: '#eab308' }, // Copa America
};

export interface LeagueEvent {
  id: number;
  name: string;
  emoji: string;
  accentColor: string;
  country: string;
  season: number;
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD
  logo: string;
}

/** Returns all active seasons for our major event IDs */
export async function getMajorEvents(): Promise<LeagueEvent[]> {
  const data = await get<{ response: any[] }>('/leagues', { current: 'true' });
  const today = new Date();
  const in90 = new Date(today);
  in90.setDate(today.getDate() + 90);

  const events: LeagueEvent[] = [];
  for (const item of data.response ?? []) {
    const id: number = item.league?.id;
    const meta = MAJOR_EVENT_IDS[id];
    if (!meta) continue;

    const season = item.seasons?.find((s: any) => s.current);
    if (!season) continue;

    const start = new Date(season.start);
    const end = new Date(season.end);

    // Show if currently active OR starting within 90 days
    const isActive = today >= start && today <= end;
    const isUpcoming = start > today && start <= in90;
    if (!isActive && !isUpcoming) continue;

    events.push({
      id,
      name: item.league.name,
      emoji: meta.emoji,
      accentColor: meta.accentColor,
      country: item.country?.name ?? '',
      season: season.year,
      start: season.start,
      end: season.end,
      logo: item.league?.logo ?? '',
    });
  }

  // Sort: active first, then by start date
  return events.sort((a, b) => {
    const aActive = new Date(a.start) <= today && today <= new Date(a.end);
    const bActive = new Date(b.start) <= today && today <= new Date(b.end);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return a.start.localeCompare(b.start);
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/** Get ALL fixtures for a date in one request, then filter by leagueIds client-side.
 *  This uses 1 API call per date regardless of how many leagues are selected. */
export async function getFootballGamesByDate(
  date: string,
  leagueIds: number[]
): Promise<FootballGame[]> {
  const data = await get<{ response: any[] }>('/fixtures', { date });
  const supported = new Set(leagueIds);
  return (data.response ?? [])
    .filter((r: any) => supported.has(r.league?.id))
    .map((r: any) => {
      const leagueId = r.league.id;
      const league = SUPPORTED_LEAGUES.find(l => l.id === leagueId);
      return mapGame(r, leagueId, league?.name ?? r.league.name);
    });
}

// ── Standings ─────────────────────────────────────────────────────────────

export interface StandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  gf: number;    // goals for
  ga: number;    // goals against
  gd: number;    // goal difference
  points: number;
  form: string;  // e.g. "WWDLW"
}

export async function getStandings(leagueId: number, season: number): Promise<StandingRow[][]> {
  const data = await get<{ response: any[] }>('/standings', { league: leagueId, season });
  const groups: StandingRow[][] = [];

  for (const item of data.response ?? []) {
    for (const standing of item.league?.standings ?? []) {
      groups.push(
        standing.map((s: any): StandingRow => ({
          rank: s.rank,
          teamId: s.team.id,
          teamName: s.team.name,
          teamLogo: s.team.logo,
          played: s.all.played,
          win: s.all.win,
          draw: s.all.draw,
          lose: s.all.lose,
          gf: s.all.goals.for,
          ga: s.all.goals.against,
          gd: s.goalsDiff,
          points: s.points,
          form: s.form ?? '',
        }))
      );
    }
  }
  return groups;
}

/** Silently pre-fetch a date in the background (no await needed) */
export function prefetchFootballDate(date: string, leagueIds: number[]): void {
  setTimeout(() => {
    getFootballGamesByDate(date, leagueIds).catch(() => {/* silent */});
  }, 2000); // 2 second delay so it doesn't compete with primary fetch
}

