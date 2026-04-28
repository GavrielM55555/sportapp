const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball';

const LEAGUE_SLUG: Record<number, string> = {
  6001: 'eur.1',    // EuroLeague
  6002: 'eurocup',  // EuroCup
  6003: 'nba.gl',   // G League
};

export interface BasketballLeague {
  id: number;
  name: string;
  country: string;
  logo: string;
}

export const BASKETBALL_LEAGUES: BasketballLeague[] = [
  { id: 6001, name: 'EuroLeague',  country: 'Europe', logo: '⭐' },
  { id: 6002, name: 'EuroCup',     country: 'Europe', logo: '🏀' },
  { id: 6003, name: 'G League',    country: 'USA',    logo: '🇺🇸' },
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
