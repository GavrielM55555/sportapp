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

  return {
    id: Number(event.id),
    date: localIso(new Date(event.date)),
    kickoff: event.date,
    homeTeam: mapTeam(home),
    awayTeam: mapTeam(away),
    homeScore: status !== 'scheduled' ? Number(home.score) : null,
    awayScore: status !== 'scheduled' ? Number(away.score) : null,
    status,
    statusDetail: st.type?.shortDetail ?? '',
    note: comp.notes?.[0]?.headline ?? (event.week?.number ? `Week ${event.week.number}` : undefined),
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
