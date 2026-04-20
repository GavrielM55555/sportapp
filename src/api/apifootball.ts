const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer';

// ── ESPN league slugs ─────────────────────────────────────────────────────
const LEAGUE_SLUG: Record<number, string> = {
  4328: 'eng.1',         // Premier League
  4335: 'esp.1',         // La Liga
  4331: 'ger.1',         // Bundesliga
  4332: 'ita.1',         // Serie A
  4334: 'fra.1',         // Ligue 1
  4480: 'uefa.champions', // Champions League
  4399: 'fifa.world',    // World Cup
};

// ── Leagues we support ────────────────────────────────────────────────────
export const SUPPORTED_LEAGUES: FootballLeague[] = [
  { id: 4328, name: 'Premier League',    country: 'England', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 4335, name: 'La Liga',           country: 'Spain',   logo: '🇪🇸' },
  { id: 4331, name: 'Bundesliga',        country: 'Germany', logo: '🇩🇪' },
  { id: 4332, name: 'Serie A',           country: 'Italy',   logo: '🇮🇹' },
  { id: 4334, name: 'Ligue 1',           country: 'France',  logo: '🇫🇷' },
  { id: 4480, name: 'Champions League',  country: 'Europe',  logo: '⭐' },
  { id: 4399, name: 'World Cup',         country: 'World',   logo: '🌍' },
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

async function get<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
  const data = await res.json();
  cache.set(url, { data, ts: Date.now() });
  return data as T;
}

// ── Status mapper ─────────────────────────────────────────────────────────
function mapStatus(espnStatus: string): FootballStatus {
  if (espnStatus === 'STATUS_FINAL' || espnStatus === 'STATUS_FULL_TIME') return 'final';
  if (espnStatus === 'STATUS_IN_PROGRESS' || espnStatus === 'STATUS_HALFTIME') return 'live';
  return 'scheduled';
}

function mapGame(event: any, leagueId: number): FootballGame | null {
  try {
    const comp = event.competitions?.[0];
    if (!comp) return null;

    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) return null;

    const espnStatus = comp.status?.type?.name ?? 'STATUS_SCHEDULED';
    const status = mapStatus(espnStatus);
    const elapsed = comp.status?.clock ? Math.floor(comp.status.clock / 60) : undefined;

    const dateStr = event.date ?? '';
    const date = dateStr.split('T')[0] ?? '';
    const timeUTC = dateStr.split('T')[1]?.substring(0, 5) ?? '';

    const league = SUPPORTED_LEAGUES.find(l => l.id === leagueId);

    return {
      id: Number(event.id),
      leagueId,
      leagueName: league?.name ?? '',
      date,
      time: timeUTC,
      homeTeam: {
        id: Number(home.team.id),
        name: home.team.displayName ?? home.team.name,
        shortName: home.team.abbreviation ?? home.team.name.substring(0, 3).toUpperCase(),
        logo: home.team.logo ?? '',
      },
      awayTeam: {
        id: Number(away.team.id),
        name: away.team.displayName ?? away.team.name,
        shortName: away.team.abbreviation ?? away.team.name.substring(0, 3).toUpperCase(),
        logo: away.team.logo ?? '',
      },
      homeScore: status !== 'scheduled' ? Number(home.score) : null,
      awayScore: status !== 'scheduled' ? Number(away.score) : null,
      status,
      statusDetail: comp.status?.type?.shortDetail ?? '',
      elapsed: status === 'live' ? elapsed : undefined,
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getFootballGamesByDate(
  date: string,
  leagueIds: number[]
): Promise<FootballGame[]> {
  const espnDate = date.replace(/-/g, '');
  const results = await Promise.allSettled(
    leagueIds
      .filter(id => LEAGUE_SLUG[id])
      .map(async id => {
        const slug = LEAGUE_SLUG[id];
        const data = await get<{ events?: any[] }>(
          `${SCOREBOARD_URL}/${slug}/scoreboard?dates=${espnDate}`
        );
        return (data.events ?? [])
          .map(e => mapGame(e, id))
          .filter((g): g is FootballGame => g !== null);
      })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<FootballGame[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function getStandings(leagueId: number, season: number): Promise<StandingRow[][]> {
  const slug = LEAGUE_SLUG[leagueId];
  if (!slug) return [];

  const data = await get<any>(`${STANDINGS_URL}/${slug}/standings`);
  const entries = data?.children?.[0]?.standings?.entries ?? [];

  const stat = (entry: any, name: string): number => {
    const s = entry.stats?.find((s: any) => s.name === name);
    return Number(s?.value ?? 0);
  };

  return [[
    ...entries.map((e: any): StandingRow => ({
      rank: stat(e, 'rank'),
      teamId: Number(e.team?.id ?? 0),
      teamName: e.team?.displayName ?? e.team?.name ?? '',
      teamLogo: e.team?.logos?.[0]?.href ?? '',
      played: stat(e, 'gamesPlayed'),
      win: stat(e, 'wins'),
      draw: stat(e, 'ties'),
      lose: stat(e, 'losses'),
      gf: stat(e, 'pointsFor'),
      ga: stat(e, 'pointsAgainst'),
      gd: stat(e, 'pointDifferential'),
      points: stat(e, 'points'),
      form: e.stats?.find((s: any) => s.name === 'form')?.displayValue ?? '',
    }))
  ]];
}

// Major football events (hardcoded)
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
    return (today >= start && today <= end) || (start > today && start <= in90);
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
