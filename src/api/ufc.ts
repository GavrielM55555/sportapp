import { espnJson } from './espn';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';

export interface UfcFighter {
  name: string;
  record: string;
  flag: string;
  winner: boolean;
}

export interface UfcFight {
  id: string;
  weightClass: string;
  state: 'scheduled' | 'live' | 'final';
  detail: string;
  fighters: [UfcFighter, UfcFighter];
}

export interface UfcEvent {
  id: string;
  name: string;
  start: string;
  venue: string;
  fights: UfcFight[];   // main event first
}

export interface UfcCalendarEntry {
  name: string;
  start: string;
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

function mapFighter(c: any): UfcFighter {
  return {
    name: c?.athlete?.displayName ?? 'TBA',
    record: c?.records?.[0]?.summary ?? '',
    flag: c?.athlete?.flag?.href ?? '',
    winner: !!c?.winner,
  };
}

function mapEvent(e: any): UfcEvent {
  const fights: UfcFight[] = (e.competitions ?? []).map((c: any) => {
    const state: string = c.status?.type?.state ?? 'pre';
    return {
      id: String(c.id),
      weightClass: c.type?.abbreviation ?? '',
      state: state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled',
      detail: c.status?.type?.shortDetail ?? '',
      fighters: [mapFighter(c.competitors?.[0]), mapFighter(c.competitors?.[1])],
    };
  });
  return {
    id: String(e.id),
    name: e.name ?? '',
    start: e.date ?? '',
    venue: e.competitions?.[0]?.venue?.fullName ?? '',
    fights: fights.reverse(), // ESPN lists prelims first
  };
}

/** The current/most recent event, or a calendar entry's event.
 *  Calendar dates don't always match ESPN's US event date, so search the
 *  whole month and match by name. */
export async function getUfcEvent(entry?: UfcCalendarEntry, force = false): Promise<UfcEvent | null> {
  if (!entry) {
    const e = (await get(SCOREBOARD, force)).events?.[0];
    return e ? mapEvent(e) : null;
  }
  const data = await get(`${SCOREBOARD}?dates=${entry.start.slice(0, 7).replace('-', '')}`, force);
  const events: any[] = data.events ?? [];
  const e = events.find(x => x.name === entry.name)
    ?? events.find(x => Math.abs(new Date(x.date).getTime() - new Date(entry.start).getTime()) < 2 * 86_400_000);
  return e ? mapEvent(e) : null;
}

export async function getUfcCalendar(): Promise<UfcCalendarEntry[]> {
  const data = await get(SCOREBOARD);
  return (data.leagues?.[0]?.calendar ?? []).map((c: any) => ({ name: c.label ?? '', start: c.startDate ?? '' }));
}
