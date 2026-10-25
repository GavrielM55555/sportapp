import { Game, Team, PlayoffSeries } from '../types';
import { espnJson } from './espn';

// NBA games come from ESPN's public scoreboard (via our shared cache).
const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

// ESPN team id → the team id/abbreviation the app has always stored (balldontlie's),
// so existing picks, series ids and champion-pick points keep matching.
// [espnId, appId, abbreviation, conference, division]
const TEAM_TABLE: [string, number, string, string, string][] = [
  ['1', 1, 'ATL', 'East', 'Southeast'],   ['2', 2, 'BOS', 'East', 'Atlantic'],
  ['17', 3, 'BKN', 'East', 'Atlantic'],   ['30', 4, 'CHA', 'East', 'Southeast'],
  ['4', 5, 'CHI', 'East', 'Central'],     ['5', 6, 'CLE', 'East', 'Central'],
  ['6', 7, 'DAL', 'West', 'Southwest'],   ['7', 8, 'DEN', 'West', 'Northwest'],
  ['8', 9, 'DET', 'East', 'Central'],     ['9', 10, 'GSW', 'West', 'Pacific'],
  ['10', 11, 'HOU', 'West', 'Southwest'], ['11', 12, 'IND', 'East', 'Central'],
  ['12', 13, 'LAC', 'West', 'Pacific'],   ['13', 14, 'LAL', 'West', 'Pacific'],
  ['29', 15, 'MEM', 'West', 'Southwest'], ['14', 16, 'MIA', 'East', 'Southeast'],
  ['15', 17, 'MIL', 'East', 'Central'],   ['16', 18, 'MIN', 'West', 'Northwest'],
  ['3', 19, 'NOP', 'West', 'Southwest'],  ['18', 20, 'NYK', 'East', 'Atlantic'],
  ['25', 21, 'OKC', 'West', 'Northwest'], ['19', 22, 'ORL', 'East', 'Southeast'],
  ['20', 23, 'PHI', 'East', 'Atlantic'],  ['21', 24, 'PHX', 'West', 'Pacific'],
  ['22', 25, 'POR', 'West', 'Northwest'], ['23', 26, 'SAC', 'West', 'Pacific'],
  ['24', 27, 'SAS', 'West', 'Southwest'], ['28', 28, 'TOR', 'East', 'Atlantic'],
  ['26', 29, 'UTA', 'West', 'Northwest'], ['27', 30, 'WAS', 'East', 'Southeast'],
];
const TEAMS = new Map(TEAM_TABLE.map(([espnId, id, abbreviation, conference, division]) =>
  [espnId, { id, abbreviation, conference, division }]));

// ── Current NBA season (Oct-Dec = current year, Jan-Sep = previous year) ──
export function currentNBASeason(): number {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── Date helpers ─────────────────────────────────────────────────────────

/** YYYY-MM-DD in the device's time zone */
function localIso(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** Shift a YYYY-MM-DD string by n days */
function shiftIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

// ── Mapping ──────────────────────────────────────────────────────────────

function mapTeam(team: any): Team | null {
  const m = TEAMS.get(String(team?.id));
  if (!m) return null; // All-Star / exhibition sides
  return {
    id: m.id,
    name: team.name ?? '',
    abbreviation: m.abbreviation,
    city: team.location ?? '',
    conference: m.conference,
    division: m.division,
  };
}

function mapEvent(event: any): Game | null {
  const season: string = event.season?.slug ?? '';
  if (season === 'preseason') return null;

  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const homeTeam = mapTeam(home?.team);
  const awayTeam = mapTeam(away?.team);
  if (!homeTeam || !awayTeam) return null;

  const st = comp.status ?? {};
  const state: string = st.type?.state ?? 'pre';
  const status: Game['status'] =
    state === 'in' ? 'live' : state === 'post' && st.type?.completed ? 'final' : 'scheduled';

  // Group by the viewer's local tip-off date, not ESPN's US date
  const tip = new Date(event.date);
  let time: string | undefined;
  if (status === 'scheduled') {
    time = st.type?.name === 'STATUS_POSTPONED' ? 'Postponed'
      : event.timeValid === false ? 'TBD'
      : tip.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  const period: number | undefined = st.period || undefined;
  return {
    id: Number(event.id),
    date: localIso(tip),
    homeTeam,
    awayTeam,
    homeScore: status !== 'scheduled' ? Number(home.score) : null,
    awayScore: status !== 'scheduled' ? Number(away.score) : null,
    status,
    isOT: status === 'final' && (period ?? 0) > 4,
    period: status === 'scheduled' ? undefined : period,
    time,
    playoffs: season === 'post-season' || season === 'play-in-season',
    playoffRound: undefined,
    seriesId: undefined,
  };
}

// ── Day cache (each ESPN day fetched once per TTL) ───────────────────────
const CACHE_TTL = 5 * 60_000; // 5 minutes
const dayCache = new Map<string, { games: Game[]; ts: number }>();

/** Games on one ESPN (US) date, YYYYMMDD */
async function fetchEspnDay(compact: string, forceRefresh: boolean): Promise<Game[]> {
  const cached = dayCache.get(compact);
  if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) return cached.games;
  const data = await espnJson<{ events?: any[] }>(`${SCOREBOARD_URL}?dates=${compact}`);
  const games = (data.events ?? []).map(mapEvent).filter((g): g is Game => g !== null);
  dayCache.set(compact, { games, ts: Date.now() });
  return games;
}

// ── Public API ────────────────────────────────────────────────────────────

/** Get games whose local tip-off date falls within the given local dates.
 *  Pass forceRefresh=true to bypass the in-app cache (used for live score updates). */
export async function getGamesByDates(dates: string[], forceRefresh = false): Promise<Game[]> {
  const sorted = [...dates].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];

  // A local day can span two US dates, so fetch one extra US day each side
  const espnDays: string[] = [];
  for (let d = shiftIso(start, -1); d <= shiftIso(end, 1); d = shiftIso(d, 1)) {
    espnDays.push(d.replace(/-/g, ''));
  }
  const perDay = await Promise.all(espnDays.map(d => fetchEspnDay(d, forceRefresh)));

  const seen = new Set<number>();
  return perDay.flat().filter(g => {
    if (seen.has(g.id) || g.date < start || g.date > end) return false;
    seen.add(g.id);
    return true;
  });
}

/** Get playoff games for a season (season = start year, e.g. 2025 for 2025-26) */
export const playoffCache = new Map<number, { games: Game[]; ts: number }>();
const PLAYOFF_CACHE_TTL = 5 * 60_000; // 5 minutes

export async function getPlayoffGames(season?: number): Promise<Game[]> {
  const s = season ?? currentNBASeason();

  const cached = playoffCache.get(s);
  if (cached && Date.now() - cached.ts < PLAYOFF_CACHE_TTL) return cached.games;

  // ESPN no longer accepts date ranges, but a whole month (YYYYMM) works.
  // Playoffs run April–June of the season's end year.
  const months = ['04', '05', '06'].map(m => `${s + 1}${m}`);
  const results = await Promise.all(
    months.map(m => espnJson<{ events?: any[] }>(`${SCOREBOARD_URL}?dates=${m}&limit=300`))
  );
  const allGames = results
    .flatMap(r => r.events ?? [])
    .filter(e => e.season?.slug === 'post-season')
    .map(mapEvent)
    .filter((g): g is Game => g !== null);

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
