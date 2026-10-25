import { espnJson } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/tennis';

export type Tour = 'atp' | 'wta';

export interface TennisPlayer {
  name: string;
  flag: string;
  seed?: string;
  sets: { games: number; tiebreak?: number }[];
  winner: boolean;
}

export interface TennisMatch {
  id: string;
  round: string;
  start: string;
  state: 'scheduled' | 'live' | 'final';
  detail: string;
  players: [TennisPlayer, TennisPlayer];
}

export interface TennisTournament {
  id: string;
  name: string;
  start: string;
  end: string;
  matches: TennisMatch[];  // singles only, newest round first
}

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 2 * 60_000;

async function get(url: string, force = false): Promise<any> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await espnJson(url);
  cache.set(url, { data, ts: Date.now() });
  return data;
}

function mapPlayer(c: any): TennisPlayer {
  return {
    name: c?.athlete?.displayName ?? c?.roster?.displayName ?? 'TBD',
    flag: c?.athlete?.flag?.href ?? '',
    seed: c?.seed ? String(c.seed) : undefined,
    sets: (c?.linescores ?? []).map((l: any) => ({ games: Number(l.value ?? 0), tiebreak: l.tiebreak })),
    winner: !!c?.winner,
  };
}

function mapMatch(c: any): TennisMatch {
  const state: string = c.status?.type?.state ?? 'pre';
  return {
    id: String(c.id),
    round: c.round?.displayName ?? '',
    start: c.date ?? '',
    state: state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled',
    detail: c.status?.type?.shortDetail ?? '',
    players: [mapPlayer(c.competitors?.[0]), mapPlayer(c.competitors?.[1])],
  };
}

/** Tournaments running this week on a tour, with their singles matches */
export async function getTennisTournaments(tour: Tour, force = false): Promise<TennisTournament[]> {
  const data = await get(`${SITE}/${tour}/scoreboard`, force);
  const tournaments: TennisTournament[] = (data.events ?? []).map((e: any) => {
    const singles = (e.groupings ?? []).find((g: any) => /singles/.test(g.grouping?.slug ?? ''));
    const matches: TennisMatch[] = (singles?.competitions ?? []).map(mapMatch);
    // Live first, then latest start time, so the current round is at the top
    const rank = (m: TennisMatch) => (m.state === 'live' ? 0 : 1);
    matches.sort((a, b) => rank(a) - rank(b) || b.start.localeCompare(a.start));
    return { id: String(e.id), name: e.name ?? '', start: e.date ?? '', end: e.endDate ?? '', matches };
  });
  // ESPN sometimes lists the same tournament twice; keep the one with matches
  const byName = new Map<string, TennisTournament>();
  for (const t of tournaments) {
    const prev = byName.get(t.name);
    if (!prev || t.matches.length > prev.matches.length) byName.set(t.name, t);
  }
  return [...byName.values()].filter(t => t.matches.length > 0);
}
