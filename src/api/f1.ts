import { espnJson } from './espn';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/racing/f1/standings';

export type SessionState = 'scheduled' | 'live' | 'final';

export interface F1Result {
  position: number;
  driverId: string;
  driver: string;
  shortName: string;
  flag: string;
}

export interface F1Session {
  id: string;
  type: string;          // 'FP1' | 'FP2' | 'FP3' | 'Qual' | 'Sprint' | 'Race' | …
  label: string;
  start: string;         // ISO
  state: SessionState;
  results: F1Result[];   // ordered; empty before the session
}

export interface F1Weekend {
  id: string;
  name: string;
  circuit: string;
  location: string;
  start: string;
  end: string;
  sessions: F1Session[];
}

export interface F1CalendarEntry {
  name: string;
  start: string;
  end: string;
}

export interface F1Standings {
  drivers: { rank: number; driverId: string; name: string; flag: string; points: number }[];
  constructors: { rank: number; teamId: string; name: string; color: string; points: number }[];
}

const SESSION_LABEL: Record<string, string> = {
  FP1: 'Practice 1', FP2: 'Practice 2', FP3: 'Practice 3',
  Qual: 'Qualifying', SS: 'Sprint Shootout', SQ: 'Sprint Qualifying', Sprint: 'Sprint', Race: 'Race',
};

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 2 * 60_000;

async function get(url: string, force = false): Promise<any> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await espnJson(url);
  cache.set(url, { data, ts: Date.now() });
  return data;
}

function mapSession(c: any): F1Session {
  const state: string = c.status?.type?.state ?? 'pre';
  const type: string = c.type?.abbreviation ?? '';
  return {
    id: String(c.id),
    type,
    label: SESSION_LABEL[type] ?? c.type?.text ?? type,
    start: c.date ?? c.startDate ?? '',
    state: state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled',
    results: state === 'pre' ? [] : (c.competitors ?? [])
      .filter((x: any) => typeof x.order === 'number')
      .sort((a: any, b: any) => a.order - b.order)
      .map((x: any): F1Result => ({
        position: x.order,
        driverId: String(x.id),
        driver: x.athlete?.displayName ?? '',
        shortName: x.athlete?.shortName ?? '',
        flag: x.athlete?.flag?.href ?? '',
      })),
  };
}

function mapWeekend(e: any): F1Weekend {
  return {
    id: String(e.id),
    name: e.name ?? '',
    circuit: e.circuit?.fullName ?? '',
    location: [e.circuit?.address?.city, e.circuit?.address?.country].filter(Boolean).join(', '),
    start: e.date ?? '',
    end: e.endDate ?? '',
    sessions: (e.competitions ?? []).map(mapSession).sort((a: F1Session, b: F1Session) => a.start.localeCompare(b.start)),
  };
}

/** The current (or next) race weekend, or a calendar entry's weekend.
 *  Calendar dates are UTC while ESPN files events by US date, so search the
 *  whole month and match by name. */
export async function getF1Weekend(entry?: F1CalendarEntry, force = false): Promise<F1Weekend | null> {
  if (!entry) {
    const event = (await get(SCOREBOARD, force)).events?.[0];
    return event ? mapWeekend(event) : null;
  }
  const data = await get(`${SCOREBOARD}?dates=${entry.end.slice(0, 7).replace('-', '')}`, force);
  const events: any[] = data.events ?? [];
  const event = events.find(e => e.name === entry.name)
    ?? events.find(e => Math.abs(new Date(e.date).getTime() - new Date(entry.start).getTime()) < 4 * 86_400_000);
  return event ? mapWeekend(event) : null;
}

export async function getF1Calendar(): Promise<F1CalendarEntry[]> {
  const data = await get(SCOREBOARD);
  return (data.leagues?.[0]?.calendar ?? []).map((c: any) => ({
    name: c.label ?? '',
    start: c.startDate ?? '',
    end: c.endDate ?? '',
  }));
}

export async function getF1Standings(): Promise<F1Standings> {
  const data = await get(STANDINGS);
  const points = (e: any) => Number(e.stats?.find((s: any) => s.name === 'championshipPts' || s.name === 'points')?.value ?? 0);
  const rank = (e: any) => Number(e.stats?.find((s: any) => s.name === 'rank')?.value ?? 0);
  const [drivers, constructors] = data.children ?? [];
  return {
    drivers: (drivers?.standings?.entries ?? []).map((e: any) => ({
      rank: rank(e), driverId: String(e.athlete?.id ?? ''), name: e.athlete?.displayName ?? '',
      flag: e.athlete?.flag?.href ?? '', points: points(e),
    })).sort((a: any, b: any) => a.rank - b.rank),
    constructors: (constructors?.standings?.entries ?? []).map((e: any) => ({
      rank: rank(e), teamId: String(e.team?.id ?? ''), name: e.team?.displayName ?? '',
      color: e.team?.color ? `#${e.team.color}` : '#6b7280', points: points(e),
    })).sort((a: any, b: any) => a.rank - b.rank),
  };
}
