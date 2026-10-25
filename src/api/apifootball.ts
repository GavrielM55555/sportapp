import { espnJson } from './espn';

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/soccer';

// ── Leagues we support ────────────────────────────────────────────────────
// The first seven ids predate ESPN and are stored in groups/preferences, so
// they stay; newer leagues use ESPN's own league id.
// `americas`: evening kick-offs there fall on the next day in Europe/Israel,
// so we also fetch the previous ESPN (US) date for them.
export const SUPPORTED_LEAGUES: FootballLeague[] = [
  { id: 4480,  slug: 'uefa.champions',        name: 'Champions League',   country: 'Europe',       logo: '⭐' },
  { id: 4328,  slug: 'eng.1',                 name: 'Premier League',     country: 'England',      logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 4335,  slug: 'esp.1',                 name: 'La Liga',            country: 'Spain',        logo: '🇪🇸' },
  { id: 4331,  slug: 'ger.1',                 name: 'Bundesliga',         country: 'Germany',      logo: '🇩🇪' },
  { id: 4332,  slug: 'ita.1',                 name: 'Serie A',            country: 'Italy',        logo: '🇮🇹' },
  { id: 4334,  slug: 'fra.1',                 name: 'Ligue 1',            country: 'France',       logo: '🇫🇷' },
  { id: 10750, slug: 'isr.1',                 name: 'Ligat Ha\'Al',       country: 'Israel',       logo: '🇮🇱' },
  { id: 776,   slug: 'uefa.europa',           name: 'Europa League',      country: 'Europe',       logo: '🟠' },
  { id: 20296, slug: 'uefa.europa.conf',      name: 'Conference League',  country: 'Europe',       logo: '🟢' },
  { id: 3914,  slug: 'eng.2',                 name: 'Championship',       country: 'England',      logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 3918,  slug: 'eng.fa',                name: 'FA Cup',             country: 'England',      logo: '🏆' },
  { id: 3920,  slug: 'eng.league_cup',        name: 'Carabao Cup',        country: 'England',      logo: '🏆' },
  { id: 725,   slug: 'ned.1',                 name: 'Eredivisie',         country: 'Netherlands',  logo: '🇳🇱' },
  { id: 715,   slug: 'por.1',                 name: 'Primeira Liga',      country: 'Portugal',     logo: '🇵🇹' },
  { id: 3946,  slug: 'tur.1',                 name: 'Süper Lig',          country: 'Turkey',       logo: '🇹🇷' },
  { id: 735,   slug: 'sco.1',                 name: 'Premiership',        country: 'Scotland',     logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { id: 3901,  slug: 'bel.1',                 name: 'Pro League',         country: 'Belgium',      logo: '🇧🇪' },
  { id: 3955,  slug: 'gre.1',                 name: 'Super League',       country: 'Greece',       logo: '🇬🇷' },
  { id: 21231, slug: 'ksa.1',                 name: 'Saudi Pro League',   country: 'Saudi Arabia', logo: '🇸🇦' },
  { id: 770,   slug: 'usa.1',                 name: 'MLS',                country: 'USA',          logo: '🇺🇸', americas: true },
  { id: 760,   slug: 'mex.1',                 name: 'Liga MX',            country: 'Mexico',       logo: '🇲🇽', americas: true },
  { id: 630,   slug: 'bra.1',                 name: 'Brasileirão',        country: 'Brazil',       logo: '🇧🇷', americas: true },
  { id: 745,   slug: 'arg.1',                 name: 'Liga Profesional',   country: 'Argentina',    logo: '🇦🇷', americas: true },
  { id: 783,   slug: 'conmebol.libertadores', name: 'Libertadores',       country: 'South America', logo: '🏆', americas: true },
  { id: 4399,  slug: 'fifa.world',            name: 'World Cup',          country: 'World',        logo: '🌍' },
  { id: 786,   slug: 'fifa.worldq.uefa',      name: 'WC Qualifying',      country: 'Europe',       logo: '🌍' },
  { id: 2395,  slug: 'uefa.nations',          name: 'Nations League',     country: 'Europe',       logo: '🇪🇺' },
];

/** Shown when the user hasn't picked leagues — the big leagues plus Israel */
export const DEFAULT_LEAGUE_IDS = [4480, 4328, 4335, 4331, 4332, 4334, 10750, 776];

const LEAGUES_BY_ID = new Map(SUPPORTED_LEAGUES.map(l => [l.id, l]));
export const leagueSlug = (id: number): string | undefined => LEAGUES_BY_ID.get(id)?.slug;

export interface FootballLeague {
  id: number;
  slug: string;
  name: string;
  country: string;
  logo: string;
  americas?: boolean;
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
  date: string;        // local kick-off date, YYYY-MM-DD
  time: string;        // UTC HH:MM
  kickoff: string;     // ISO instant, for sorting
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
  const data = await espnJson(url);
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
    const timeUTC = dateStr.split('T')[1]?.substring(0, 5) ?? '';

    const league = LEAGUES_BY_ID.get(leagueId);

    return {
      id: Number(event.id),
      leagueId,
      leagueName: league?.name ?? '',
      date: dateStr ? localIso(new Date(dateStr)) : '',
      time: timeUTC,
      kickoff: dateStr,
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

/** YYYY-MM-DD in the device's time zone */
function localIso(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** YYYYMMDD for the day before a YYYY-MM-DD date */
function previousCompact(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

/** Games kicking off on `date` (local) in the given leagues */
export async function getFootballGamesByDate(
  date: string,
  leagueIds: number[]
): Promise<FootballGame[]> {
  const espnDays = (league: FootballLeague) =>
    league.americas ? [previousCompact(date), date.replace(/-/g, '')] : [date.replace(/-/g, '')];

  const results = await Promise.allSettled(
    leagueIds
      .map(id => LEAGUES_BY_ID.get(id))
      .filter((l): l is FootballLeague => !!l)
      .flatMap(league => espnDays(league).map(async day => {
        const data = await get<{ events?: any[] }>(
          `${SCOREBOARD_URL}/${league.slug}/scoreboard?dates=${day}`
        );
        return (data.events ?? [])
          .map(e => mapGame(e, league.id))
          .filter((g): g is FootballGame => g !== null);
      }))
  );

  const seen = new Set<number>();
  return results
    .filter((r): r is PromiseFulfilledResult<FootballGame[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(g => {
      if (g.date !== date || seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** Start year of the football season in progress (Jul–Jun) */
function currentSeasonStartYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** League table, one array per group (e.g. a championship/relegation split).
 *  Empty when ESPN only has an older season — better no table than a stale one. */
export async function getStandings(leagueId: number): Promise<StandingRow[][]> {
  const slug = leagueSlug(leagueId);
  if (!slug) return [];

  const data = await get<any>(`${STANDINGS_URL}/${slug}/standings`);
  const groups: any[] = data?.children ?? [];
  const seasonYear = parseInt(groups[0]?.standings?.seasonDisplayName ?? '', 10);
  if (seasonYear && seasonYear < currentSeasonStartYear()) return [];

  const stat = (entry: any, name: string): number => {
    const s = entry.stats?.find((s: any) => s.name === name);
    return Number(s?.value ?? 0);
  };

  return groups.map(g => (g.standings?.entries ?? []).map((e: any, i: number): StandingRow => ({
      rank: i + 1,
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
    })));
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
