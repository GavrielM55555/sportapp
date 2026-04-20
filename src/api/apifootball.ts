const BASE_URL = 'https://www.thesportsdb.com/api/v1/json/123';

// ── Leagues we support (TheSportsDB IDs) ─────────────────────────────────
export const SUPPORTED_LEAGUES: FootballLeague[] = [
  { id: 4328, name: 'Premier League',    country: 'England',  logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 4335, name: 'La Liga',           country: 'Spain',    logo: '🇪🇸' },
  { id: 4331, name: 'German Bundesliga', country: 'Germany',  logo: '🇩🇪' },
  { id: 4332, name: 'Italian Serie A',   country: 'Italy',    logo: '🇮🇹' },
  { id: 4334, name: 'French Ligue 1',    country: 'France',   logo: '🇫🇷' },
  { id: 4480, name: 'Champions League',  country: 'Europe',   logo: '⭐' },
  { id: 4399, name: 'World Cup',         country: 'World',    logo: '🌍' },
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
  date: string;
  time: string;
  homeTeam: FootballTeam;
  awayTeam: FootballTeam;
  homeScore: number | null;
  awayScore: number | null;
  status: FootballStatus;
  statusDetail: string;
  elapsed?: number;
}

export interface LeagueEvent {
  id: number;
  name: string;
  emoji: string;
  accentColor: string;
  country: string;
  season: number;
  start: string;
  end: string;
  logo: string;
}

export interface StandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60_000;

async function get<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`thesportsdb ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, ts: Date.now() });
  return data as T;
}

// ── Status mapper ─────────────────────────────────────────────────────────
function mapStatus(raw: string): FootballStatus {
  if (!raw) return 'scheduled';
  const s = raw.toLowerCase();
  if (s === 'match finished' || s === 'ft' || s === 'aet' || s === 'pen') return 'final';
  if (s === '1h' || s === '2h' || s === 'ht' || s === 'et' || s === 'live' ||
      s === 'extra time' || s === 'penalties') return 'live';
  return 'scheduled';
}

function mapGame(raw: any): FootballGame | null {
  if (!raw) return null;
  const leagueId = Number(raw.idLeague);
  const league = SUPPORTED_LEAGUES.find(l => l.id === leagueId);
  if (!league) return null;

  const homeScore = raw.intHomeScore !== null && raw.intHomeScore !== '' ? Number(raw.intHomeScore) : null;
  const awayScore = raw.intAwayScore !== null && raw.intAwayScore !== '' ? Number(raw.intAwayScore) : null;
  const status = mapStatus(raw.strStatus ?? '');

  return {
    id: Number(raw.idEvent),
    leagueId,
    leagueName: league.name,
    date: raw.dateEvent ?? '',
    time: raw.strTime?.substring(0, 5) ?? '',
    homeTeam: {
      id: Number(raw.idHomeTeam),
      name: raw.strHomeTeam ?? '',
      shortName: (raw.strHomeTeam ?? '').substring(0, 3).toUpperCase(),
      logo: raw.strHomeTeamBadge ?? '',
    },
    awayTeam: {
      id: Number(raw.idAwayTeam),
      name: raw.strAwayTeam ?? '',
      shortName: (raw.strAwayTeam ?? '').substring(0, 3).toUpperCase(),
      logo: raw.strAwayTeamBadge ?? '',
    },
    homeScore: status === 'scheduled' ? null : homeScore,
    awayScore: status === 'scheduled' ? null : awayScore,
    status,
    statusDetail: raw.strStatus ?? '',
  };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getFootballGamesByDate(
  date: string,
  leagueIds: number[]
): Promise<FootballGame[]> {
  const data = await get<{ events: any[] | null }>(`/eventsday.php?d=${date}&s=Soccer`);
  const supported = new Set(leagueIds);
  return (data.events ?? [])
    .map(mapGame)
    .filter((g): g is FootballGame => g !== null && supported.has(g.leagueId));
}

export async function getStandings(leagueId: number, season: number): Promise<StandingRow[][]> {
  const seasonStr = `${season}-${season + 1}`;
  const data = await get<{ table: any[] | null }>(`/lookuptable.php?l=${leagueId}&s=${seasonStr}`);
  if (!data.table) return [];
  return [[
    ...data.table.map((s: any): StandingRow => ({
      rank: Number(s.intRank ?? 0),
      teamId: Number(s.idTeam ?? 0),
      teamName: s.strTeam ?? '',
      teamLogo: s.strTeamBadge ?? '',
      played: Number(s.intPlayed ?? 0),
      win: Number(s.intWin ?? 0),
      draw: Number(s.intDraw ?? 0),
      lose: Number(s.intLoss ?? 0),
      gf: Number(s.intGoalsFor ?? 0),
      ga: Number(s.intGoalsAgainst ?? 0),
      gd: Number(s.intGoalDifference ?? 0),
      points: Number(s.intPoints ?? 0),
      form: s.strForm ?? '',
    }))
  ]];
}

// Major football events (hardcoded with TheSportsDB IDs)
const MAJOR_EVENTS: LeagueEvent[] = [
  {
    id: 4480,
    name: 'UEFA Champions League',
    emoji: '⭐',
    accentColor: '#3b82f6',
    country: 'Europe',
    season: 2025,
    start: '2025-09-17',
    end: '2026-05-31',
    logo: '',
  },
  {
    id: 4399,
    name: 'FIFA World Cup',
    emoji: '🌍',
    accentColor: '#22c55e',
    country: 'World',
    season: 2026,
    start: '2026-06-11',
    end: '2026-07-19',
    logo: '',
  },
];

export async function getMajorEvents(): Promise<LeagueEvent[]> {
  const today = new Date();
  const in90 = new Date(today);
  in90.setDate(today.getDate() + 90);

  return MAJOR_EVENTS.filter(e => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    const isActive = today >= start && today <= end;
    const isUpcoming = start > today && start <= in90;
    return isActive || isUpcoming;
  }).sort((a, b) => {
    const aActive = new Date(a.start) <= today && today <= new Date(a.end);
    const bActive = new Date(b.start) <= today && today <= new Date(b.end);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return a.start.localeCompare(b.start);
  });
}

export function prefetchFootballDate(date: string, leagueIds: number[]): void {
  setTimeout(() => {
    getFootballGamesByDate(date, leagueIds).catch(() => {});
  }, 2000);
}
