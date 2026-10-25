import { espnJson } from './espn';

// Generic ESPN scoreboard for head-to-head team sports (NFL, MLB, …).
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports';

export interface TeamLeague {
  key: 'nfl' | 'mlb';
  path: string;          // ESPN sport/league, e.g. 'football/nfl'
  name: string;
  country: string;
  logo: string;
}

export const TEAM_LEAGUES: Record<TeamLeague['key'], TeamLeague> = {
  nfl: { key: 'nfl', path: 'football/nfl', name: 'NFL', country: 'USA', logo: '🏈' },
  mlb: { key: 'mlb', path: 'baseball/mlb', name: 'MLB', country: 'USA', logo: '⚾' },
};

export interface TeamGame {
  id: number;
  date: string;          // local start date, YYYY-MM-DD
  kickoff: string;       // ISO instant
  homeTeam: { id: number; name: string; shortName: string; logo: string };
  awayTeam: { id: number; name: string; shortName: string; logo: string };
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'live' | 'final';
  statusDetail: string;  // e.g. "Q3 4:12", "Bot 7th", "Final/OT"
  note?: string;         // e.g. "Week 8", "World Series - Game 3"
  seasonType: number;    // ESPN: 1 preseason, 2 regular, 3 postseason
  round?: PlayoffRoundCode;
  series?: { completed: boolean; total: number; wins: Record<number, number> };
}

// ── Playoff rounds ───────────────────────────────────────────────────────
export type PlayoffRoundCode =
  | 'nfl_wc' | 'nfl_div' | 'nfl_conf' | 'nfl_sb'
  | 'mlb_wc' | 'mlb_ds' | 'mlb_cs' | 'mlb_ws';

export const ROUND_INFO: Record<PlayoffRoundCode, { label: string; order: number }> = {
  nfl_wc:   { label: 'Wild Card',          order: 0 },
  nfl_div:  { label: 'Divisional',         order: 1 },
  nfl_conf: { label: 'Conference Finals',  order: 2 },
  nfl_sb:   { label: 'Super Bowl',         order: 3 },
  mlb_wc:   { label: 'Wild Card Series',   order: 0 },
  mlb_ds:   { label: 'Division Series',    order: 1 },
  mlb_cs:   { label: 'Championship Series', order: 2 },
  mlb_ws:   { label: 'World Series',       order: 3 },
};

/** ESPN headlines are messy ("ALCS Rain - Makeup on Oct 18") — map them to a round */
function roundFromHeadline(h: string): PlayoffRoundCode | undefined {
  if (/Wild Card Playoffs/i.test(h)) return 'nfl_wc';
  if (/Divisional Playoffs/i.test(h)) return 'nfl_div';
  if (/(AFC|NFC) Championship/i.test(h)) return 'nfl_conf';
  if (/Super Bowl/i.test(h)) return 'nfl_sb';
  if (/^(AL|NL)WC/i.test(h)) return 'mlb_wc';
  if (/^(AL|NL)DS/i.test(h)) return 'mlb_ds';
  if (/^(AL|NL)CS/i.test(h)) return 'mlb_cs';
  if (/^World Series/i.test(h)) return 'mlb_ws';
  return undefined; // e.g. Pro Bowl
}

export interface WinLossRow {
  teamId: number;
  teamName: string;
  teamLogo: string;
  win: number;
  lose: number;
  pct: string;
  gb: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function localIso(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

function shiftCompact(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60_000;

async function get(url: string, force = false): Promise<any> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await espnJson(url);
  cache.set(url, { data, ts: Date.now() });
  return data;
}

function mapTeam(c: any) {
  const t = c?.team ?? {};
  return {
    id: Number(t.id),
    name: t.displayName ?? t.name ?? '',
    shortName: t.abbreviation ?? (t.name ?? '').slice(0, 3).toUpperCase(),
    logo: t.logo ?? '',
  };
}

export function mapTeamEvent(event: any): TeamGame | null {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  if (!home || !away) return null;

  const st = comp.status ?? event.status ?? {};
  const state: string = st.type?.state ?? 'pre';
  const status: TeamGame['status'] =
    state === 'in' ? 'live' : state === 'post' && st.type?.completed ? 'final' : 'scheduled';
  const seasonType = Number(event.season?.type ?? 2);
  const headline: string = comp.notes?.[0]?.headline ?? '';
  const series = comp.series?.type === 'playoff' ? {
    completed: !!comp.series.completed,
    total: Number(comp.series.totalCompetitions ?? 0),
    wins: Object.fromEntries((comp.series.competitors ?? []).map((c: any) => [Number(c.id), Number(c.wins ?? 0)])),
  } : undefined;

  return {
    seasonType,
    round: seasonType === 3 ? roundFromHeadline(headline) : undefined,
    series,
    id: Number(event.id),
    date: localIso(new Date(event.date)),
    kickoff: event.date,
    homeTeam: mapTeam(home),
    awayTeam: mapTeam(away),
    homeScore: status !== 'scheduled' ? Number(home.score) : null,
    awayScore: status !== 'scheduled' ? Number(away.score) : null,
    status,
    statusDetail: st.type?.shortDetail ?? '',
    // Playoff games carry a headline ("ALDS - Game 2"); ESPN season type 1 is preseason
    note: comp.notes?.[0]?.headline
      ?? (event.season?.type === 1 ? 'Preseason' : event.week?.number ? `Week ${event.week.number}` : undefined),
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/** Games starting on `date` (local). ESPN dates are US dates, so fetch a day each side. */
export async function getTeamGames(league: TeamLeague, date: string, force = false): Promise<TeamGame[]> {
  const days = [-1, 0, 1].map(n => shiftCompact(date, n));
  const results = await Promise.allSettled(
    days.map(d => get(`${SITE}/${league.path}/scoreboard?dates=${d}`, force))
  );
  const seen = new Set<number>();
  return results
    .flatMap(r => (r.status === 'fulfilled' ? r.value.events ?? [] : []))
    .map(mapTeamEvent)
    .filter((g): g is TeamGame => {
      if (!g || g.date !== date || seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** Season year a league is in now: NFL seasons run Sep–Feb, MLB Mar–Nov */
export function currentSeasonYear(league: TeamLeague): number {
  const now = new Date();
  return league.key === 'nfl' && now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
}

/** Every postseason game of a season (playoff rounds only, no Pro Bowl).
 *  ESPN rejects date ranges but accepts whole months. */
export async function getPostseason(league: TeamLeague, seasonYear: number, force = false): Promise<TeamGame[]> {
  const months = league.key === 'nfl'
    ? [`${seasonYear + 1}01`, `${seasonYear + 1}02`]
    : [`${seasonYear}09`, `${seasonYear}10`, `${seasonYear}11`];
  const results = await Promise.allSettled(
    months.map(m => get(`${SITE}/${league.path}/scoreboard?dates=${m}&limit=500`, force))
  );
  const seen = new Set<number>();
  return results
    .flatMap(r => (r.status === 'fulfilled' ? r.value.events ?? [] : []))
    .map(mapTeamEvent)
    .filter((g): g is TeamGame => {
      if (!g || !g.round || seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export interface TeamSeries {
  id: string;                 // `${round}-${lowTeamId}-${highTeamId}`
  round: PlayoffRoundCode;
  teams: [TeamGame['homeTeam'], TeamGame['homeTeam']];
  games: TeamGame[];
  bestOf: number;
  wins: Record<number, number>;
  winnerId?: number;
  start: string;              // first game's start — picks lock here
}

/** Group MLB postseason games into series (one per round per team pair) */
export function groupTeamSeries(games: TeamGame[]): TeamSeries[] {
  const map = new Map<string, TeamSeries>();
  for (const g of games) {
    if (!g.round) continue;
    const ids = [g.homeTeam.id, g.awayTeam.id].sort((a, b) => a - b);
    const id = `${g.round}-${ids[0]}-${ids[1]}`;
    let s = map.get(id);
    if (!s) {
      const first = g.homeTeam.id === ids[0] ? [g.homeTeam, g.awayTeam] : [g.awayTeam, g.homeTeam];
      s = { id, round: g.round, teams: first as TeamSeries['teams'], games: [], bestOf: 0, wins: {}, start: g.kickoff };
      map.set(id, s);
    }
    s.games.push(g);
    s.bestOf = Math.max(s.bestOf, g.series?.total ?? 0);
  }
  for (const s of map.values()) {
    // Count wins from final games (ESPN's per-game series object can lag)
    s.wins = { [s.teams[0].id]: 0, [s.teams[1].id]: 0 };
    for (const g of s.games) {
      if (g.status !== 'final' || g.homeScore === null || g.awayScore === null) continue;
      const w = g.homeScore > g.awayScore ? g.homeTeam.id : g.awayTeam.id;
      s.wins[w] = (s.wins[w] ?? 0) + 1;
    }
    const need = Math.ceil((s.bestOf || 7) / 2);
    s.winnerId = s.teams.find(t => s.wins[t.id] >= need)?.id;
    s.games.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    s.start = s.games[0].kickoff;
  }
  return [...map.values()].sort((a, b) => ROUND_INFO[a.round].order - ROUND_INFO[b.round].order || a.start.localeCompare(b.start));
}

/** Win/loss standings, one table per conference / league (AFC/NFC, AL/NL) */
export async function getWinLossStandings(path: string): Promise<{ name: string; rows: WinLossRow[] }[]> {
  const data = await get(`${STANDINGS}/${path}/standings`);
  const stat = (e: any, name: string) => e.stats?.find((s: any) => s.name === name);
  const groups: any[] = data?.children?.length ? data.children : [data];
  return groups.map(g => ({
    name: g.name ?? '',
    rows: (g.standings?.entries ?? [])
      .map((e: any): WinLossRow => ({
        teamId: Number(e.team?.id ?? 0),
        teamName: e.team?.displayName ?? '',
        teamLogo: e.team?.logos?.[0]?.href ?? '',
        win: Number(stat(e, 'wins')?.value ?? 0),
        lose: Number(stat(e, 'losses')?.value ?? 0),
        pct: stat(e, 'winPercent')?.displayValue ?? '',
        gb: stat(e, 'gamesBehind')?.displayValue ?? '-',
      }))
      .sort((a: WinLossRow, b: WinLossRow) => b.win / Math.max(1, b.win + b.lose) - a.win / Math.max(1, a.win + a.lose)),
  }));
}
