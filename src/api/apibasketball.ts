const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball';

const LEAGUE_SLUG: Record<number, string> = {
  6001: 'wnba',  // WNBA
  6002: 'nbl',   // Australia NBL
  6003: 'fiba',  // FIBA (World Cup / competitions)
};

// NBA standings use ESPN too (games come from BallDontLie but standings from ESPN)
const NBA_STANDINGS_SLUG = 'nba';

export interface BasketballStandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  played: number;
  win: number;
  lose: number;
  pct: string;
  gb: string;
  points: number;
}

export interface BasketballLeague {
  id: number;
  name: string;
  country: string;
  logo: string;
}

export const BASKETBALL_LEAGUES: BasketballLeague[] = [
  { id: 6001, name: 'WNBA',  country: 'USA',       logo: '🏀' },
  { id: 6002, name: 'NBL',   country: 'Australia', logo: '🇦🇺' },
  { id: 6003, name: 'FIBA',  country: 'World',     logo: '🌍' },
];

export interface BasketballGame {
  id: number;
  leagueId: number;
  leagueName: string;
  date: string;
  time: string;
  homeTeam: { id: number; name: string; shortName: string; logo: string };
  awayTeam: { id: number; name: string; shortName: string; logo: string };
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'final';
  statusDetail: string;
  elapsed?: string;
}

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

function mapStatus(name: string): 'scheduled' | 'live' | 'final' {
  if (name === 'STATUS_FINAL' || name === 'STATUS_FULL_TIME') return 'final';
  if (name === 'STATUS_IN_PROGRESS' || name === 'STATUS_HALFTIME') return 'live';
  return 'scheduled';
}

function mapGame(event: any, leagueId: number): BasketballGame | null {
  try {
    const comp = event.competitions?.[0];
    if (!comp) return null;
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
    if (!home || !away) return null;

    const espnStatus = comp.status?.type?.name ?? 'STATUS_SCHEDULED';
    const status = mapStatus(espnStatus);
    const dateStr = event.date ?? '';
    const date = dateStr.split('T')[0] ?? '';
    const timeUTC = dateStr.split('T')[1]?.substring(0, 5) ?? '';
    const league = BASKETBALL_LEAGUES.find(l => l.id === leagueId);
    const elapsed = comp.status?.type?.shortDetail ?? undefined;

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

export async function getBasketballGamesByDate(
  date: string,
  leagueIds: number[]
): Promise<BasketballGame[]> {
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
          .filter((g): g is BasketballGame => g !== null);
      })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<BasketballGame[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function getBasketballStandings(leagueId: number | 'nba'): Promise<BasketballStandingRow[][]> {
  const slug = leagueId === 'nba' ? NBA_STANDINGS_SLUG : LEAGUE_SLUG[leagueId as number];
  if (!slug) return [];

  const data = await get<any>(`${STANDINGS_URL}/${slug}/standings`);

  const stat = (entry: any, name: string): any => {
    const s = entry.stats?.find((s: any) => s.name === name);
    return s?.value ?? s?.displayValue ?? 0;
  };

  // NBA has conference standings (children), others have flat standings
  const children = data?.children ?? [];
  if (children.length > 0) {
    return children.map((conf: any) => {
      const entries = conf.standings?.entries ?? [];
      return entries.map((e: any, i: number): BasketballStandingRow => ({
        rank: i + 1,
        teamId: Number(e.team?.id ?? 0),
        teamName: e.team?.displayName ?? e.team?.name ?? '',
        teamLogo: e.team?.logos?.[0]?.href ?? '',
        played: Number(stat(e, 'gamesPlayed')),
        win: Number(stat(e, 'wins')),
        lose: Number(stat(e, 'losses')),
        pct: e.stats?.find((s: any) => s.name === 'winPercent')?.displayValue ?? '',
        gb: e.stats?.find((s: any) => s.name === 'gamesBehind')?.displayValue ?? '-',
        points: Number(stat(e, 'points')),
      }));
    });
  }

  // Flat standings (EuroLeague etc.)
  const entries = data?.standings?.entries ?? [];
  return [[
    ...entries.map((e: any, i: number): BasketballStandingRow => ({
      rank: i + 1,
      teamId: Number(e.team?.id ?? 0),
      teamName: e.team?.displayName ?? e.team?.name ?? '',
      teamLogo: e.team?.logos?.[0]?.href ?? '',
      played: Number(stat(e, 'gamesPlayed')),
      win: Number(stat(e, 'wins')),
      lose: Number(stat(e, 'losses')),
      pct: e.stats?.find((s: any) => s.name === 'winPercent')?.displayValue ?? '',
      gb: e.stats?.find((s: any) => s.name === 'gamesBehind')?.displayValue ?? '-',
      points: Number(stat(e, 'points')),
    }))
  ]];
}
