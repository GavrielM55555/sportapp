import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Group } from '../../types';
import { getF1Calendar, getF1Standings, getF1Weekend, F1CalendarEntry, F1Standings, F1Weekend } from '../../api/f1';
import { useAuthContext } from '../../context/AuthContext';
import { loadPicks, savePick, commitScores, hasStarted, PickDoc } from '../../predict/store';
import { C, Loading, Empty, localDayTime } from '../scores/ui';
import { p, ScoringInfo, MembersReveal, OptionPicker, SectionTitle } from './ui';

export const F1_EXACT = 3;       // driver in the exact podium spot
export const F1_ON_PODIUM = 1;   // driver on the podium, wrong spot
export const F1_CHAMPION = 10;   // each of drivers' / constructors' champion

interface RacePick extends PickDoc {
  raceName: string; raceStart: string; raceEnd: string; lockAt: string;
  picks: string[]; pickNames: string[];
}
interface SeasonPick extends PickDoc {
  season: string; driverId?: string; driverName?: string; teamId?: string; teamName?: string;
}

const entryOf = (x: RacePick): F1CalendarEntry => ({ name: x.raceName, start: x.raceStart, end: x.raceEnd });
const raceSession = (w: F1Weekend | null) => w?.sessions.find(x => x.type === 'Race');

export function podiumPoints(picks: string[], podium: string[]): number {
  return picks.reduce((sum, id, i) => sum + (podium[i] === id ? F1_EXACT : podium.includes(id) ? F1_ON_PODIUM : 0), 0);
}

/** F1 group: podium pick every race + drivers' and constructors' champions */
export function F1Predictions({ group }: { group: Group }) {
  const { user } = useAuthContext();
  const [calendar, setCalendar] = useState<F1CalendarEntry[] | null>(null);
  const [standings, setStandings] = useState<F1Standings | null>(null);
  const [next, setNext] = useState<{ entry: F1CalendarEntry; weekend: F1Weekend | null } | null>(null);
  const [racePicks, setRacePicks] = useState<RacePick[]>([]);
  const [seasonPicks, setSeasonPicks] = useState<SeasonPick[]>([]);
  const [results, setResults] = useState<Record<string, string[]>>({}); // raceName → podium driverIds
  const [draft, setDraft] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [slot, setSlot] = useState<number | null>(null);               // podium slot being picked
  const [seasonPicker, setSeasonPicker] = useState<'driver' | 'team' | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    const [cal, st, rp, sp] = await Promise.all([
      getF1Calendar(), getF1Standings(),
      loadPicks<RacePick>('f1_predictions', group.id), loadPicks<SeasonPick>('f1_season_picks', group.id),
    ]);
    setCalendar(cal);
    setStandings(st);

    const now = new Date().toISOString();
    const upcoming = cal.find(c => c.end >= now);
    if (upcoming) setNext({ entry: upcoming, weekend: await getF1Weekend(upcoming, force).catch(() => null) });
    else setNext(null);

    // Podiums for the latest races anyone picked (scoring + display)
    const races = [...new Map(rp.filter(x => x.raceEnd <= now || hasStarted(x.lockAt)).map(x => [x.raceName, x])).values()]
      .sort((a, b) => b.raceStart.localeCompare(a.raceStart)).slice(0, 6);
    const podiums: Record<string, string[]> = {};
    await Promise.all(races.map(async r => {
      const race = raceSession(await getF1Weekend(entryOf(r), force).catch(() => null));
      if (race?.state === 'final') podiums[r.raceName] = race.results.slice(0, 3).map(x => x.driverId);
    }));
    setResults(podiums);

    const scores = rp.filter(x => x.pointsEarned === undefined && podiums[x.raceName])
      .map(x => ({ col: 'f1_predictions', id: x.id, points: podiumPoints(x.picks, podiums[x.raceName]) }));

    // Season bonus: scored once the final race of the season is over
    const season = cal[0]?.start.slice(0, 4) ?? '';
    const lastRace = cal.length ? raceSession(await getF1Weekend(cal[cal.length - 1], force).catch(() => null)) : undefined;
    if (lastRace?.state === 'final') {
      const champDriver = st.drivers[0]?.driverId, champTeam = st.constructors[0]?.teamId;
      scores.push(...sp.filter(x => x.pointsEarned === undefined && x.season === season).map(x => ({
        col: 'f1_season_picks', id: x.id,
        points: (x.driverId === champDriver ? F1_CHAMPION : 0) + (x.teamId === champTeam ? F1_CHAMPION : 0),
      })));
    }

    const changed = await commitScores(group.id, scores);
    setRacePicks(changed ? await loadPicks<RacePick>('f1_predictions', group.id) : rp);
    setSeasonPicks(changed ? await loadPicks<SeasonPick>('f1_season_picks', group.id) : sp);
    setRefreshing(false);
  }, [group.id]);

  useEffect(() => { load(); }, [load]);

  // Prefill the podium draft with the user's saved pick for the next race
  const myNext = next ? racePicks.find(x => x.uid === user?.uid && x.raceName === next.entry.name) : undefined;
  useEffect(() => { setDraft(myNext ? [...myNext.picks] : [undefined, undefined, undefined]); }, [myNext?.id, next?.entry.name]);

  if (!calendar || !standings) return <Loading />;

  const drivers = standings.drivers;
  const driverName = (id?: string) => drivers.find(d => d.driverId === id)?.name ?? '';
  const season = calendar[0]?.start.slice(0, 4) ?? '';
  const seasonLocked = hasStarted(calendar[0]?.start);
  const mySeason = seasonPicks.find(x => x.uid === user?.uid && x.season === season);
  const race = raceSession(next?.weekend ?? null);
  const lockAt = race?.start ?? next?.entry.end ?? '';
  const nextLocked = hasStarted(lockAt);

  const saveRace = async () => {
    if (!user || !next || nextLocked || draft.some(d => !d)) return;
    setSaving(true);
    try {
      await savePick('f1_predictions', user.uid, group.id, { raceName: next.entry.name }, {
        raceStart: next.entry.start, raceEnd: next.entry.end, lockAt,
        picks: draft as string[], pickNames: (draft as string[]).map(driverName),
      });
      setRacePicks(await loadPicks<RacePick>('f1_predictions', group.id));
    } finally {
      setSaving(false);
    }
  };

  const saveSeason = async (field: 'driver' | 'team', id: string, name: string) => {
    if (!user || seasonLocked) return;
    const data = field === 'driver' ? { driverId: id, driverName: name } : { teamId: id, teamName: name };
    await savePick('f1_season_picks', user.uid, group.id, { season }, data);
    setSeasonPicks(await loadPicks<SeasonPick>('f1_season_picks', group.id));
  };

  const podiumLabel = (ids: string[], names?: string[]) =>
    ids.map((id, i) => `${i + 1}. ${(names?.[i] ?? driverName(id)).split(' ').slice(-1)[0]}`).join('  ');

  const pastRaces = [...new Map(racePicks.filter(x => x.raceName !== next?.entry.name).map(x => [x.raceName, x])).values()]
    .sort((a, b) => b.raceStart.localeCompare(a.raceStart));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
      <ScoringInfo lines={[
        `Podium: exact spot = ${F1_EXACT} pts · on the podium, wrong spot = ${F1_ON_PODIUM} pt (max 9 per race)`,
        `Season: drivers' champion = ${F1_CHAMPION} · constructors' champion = ${F1_CHAMPION}`,
      ]} />

      {/* Season bonus */}
      <View style={p.bonus}>
        <Text style={p.bonusTitle}>🏆 {season} champions</Text>
        <Text style={p.bonusSub}>{seasonLocked ? 'Locked — the season has started. Opens again before next season.' : `Locks ${localDayTime(calendar[0]?.start)}`}</Text>
        {seasonLocked ? (
          <MembersReveal members={group.members} pickFor={uid => {
            const x = seasonPicks.find(k => k.uid === uid && k.season === season);
            return x ? { label: `${x.driverName?.split(' ').slice(-1)[0] ?? '–'} · ${x.teamName ?? '–'}`, points: x.pointsEarned } : null;
          }} />
        ) : (
          <View style={{ gap: 8 }}>
            <TouchableOpacity style={[p.teamBtn, mySeason?.driverId && p.teamBtnSel]} onPress={() => setSeasonPicker('driver')}>
              <Text style={[p.teamBtnText, mySeason?.driverId && p.teamBtnTextSel]}>Drivers' champion: {mySeason?.driverName ?? 'pick'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[p.teamBtn, mySeason?.teamId && p.teamBtnSel]} onPress={() => setSeasonPicker('team')}>
              <Text style={[p.teamBtnText, mySeason?.teamId && p.teamBtnTextSel]}>Constructors' champion: {mySeason?.teamName ?? 'pick'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Next race */}
      {next ? (
        <View style={p.block}>
          <View style={p.blockHead}>
            <View style={{ flex: 1 }}>
              <Text style={p.blockTitle}>🏁 {next.entry.name}</Text>
              <Text style={nextLocked ? p.live : p.blockSub}>
                {nextLocked ? (race?.state === 'final' ? 'Race finished' : '● Race underway — picks locked') : `Race ${localDayTime(lockAt)} · picks lock at the start`}
              </Text>
            </View>
          </View>
          {!nextLocked ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
              {[0, 1, 2].map(i => (
                <TouchableOpacity key={i} style={[p.teamBtn, draft[i] && p.teamBtnSel, { justifyContent: 'flex-start', paddingHorizontal: 12 }]} onPress={() => setSlot(i)}>
                  <Text style={[p.teamBtnText, draft[i] && p.teamBtnTextSel]}>
                    {['🥇', '🥈', '🥉'][i]}  {draft[i] ? driverName(draft[i]) : `Pick P${i + 1}`}
                  </Text>
                </TouchableOpacity>
              ))}
              {draft.every(Boolean) && draft.join() !== myNext?.picks.join() && (
                <TouchableOpacity style={p.pickBtn} onPress={saveRace} disabled={saving}>
                  <Text style={p.pickBtnText}>{saving ? 'Saving…' : 'Lock in podium'}</Text>
                </TouchableOpacity>
              )}
              {myNext && draft.join() === myNext.picks.join() && <Text style={p.blockSub}>✓ Podium saved</Text>}
              <Text style={p.count}>{racePicks.filter(x => x.raceName === next.entry.name).length}/{group.members.length} picked</Text>
            </View>
          ) : (
            <MembersReveal members={group.members} pickFor={uid => {
              const x = racePicks.find(k => k.uid === uid && k.raceName === next.entry.name);
              return x ? { label: podiumLabel(x.picks, x.pickNames), points: x.pointsEarned } : null;
            }} />
          )}
        </View>
      ) : <Empty emoji="🏎️" text="The season is over" sub="Podium picks open again for next season's first race" />}

      {/* Past races */}
      {pastRaces.length > 0 && <SectionTitle>Past races</SectionTitle>}
      {pastRaces.map(r => (
        <View key={r.raceName} style={p.block}>
          <View style={p.blockHead}>
            <View style={{ flex: 1 }}>
              <Text style={p.blockTitle}>{r.raceName}</Text>
              <Text style={p.final}>{results[r.raceName] ? `Podium: ${podiumLabel(results[r.raceName])}` : 'Waiting for results'}</Text>
            </View>
          </View>
          <MembersReveal members={group.members} pickFor={uid => {
            const x = racePicks.find(k => k.uid === uid && k.raceName === r.raceName);
            return x ? { label: podiumLabel(x.picks, x.pickNames), points: x.pointsEarned, correct: x.pointsEarned === undefined ? undefined : x.pointsEarned > 0 } : null;
          }} />
        </View>
      ))}

      <OptionPicker visible={slot !== null} title={slot !== null ? `Pick P${slot + 1}` : ''}
        options={drivers.map(d => ({ id: d.driverId, label: d.name, sub: `${d.points} pts this season`, image: d.flag }))}
        disabledIds={draft.filter((d, i) => d && i !== slot) as string[]}
        onClose={() => setSlot(null)}
        onPick={o => { setDraft(prev => prev.map((d, i) => (i === slot ? o.id : d))); setSlot(null); }} />

      <OptionPicker visible={seasonPicker !== null}
        title={seasonPicker === 'team' ? "Constructors' champion" : "Drivers' champion"} subtitle={`${F1_CHAMPION} pts if you're right`}
        options={seasonPicker === 'team'
          ? standings.constructors.map(t => ({ id: t.teamId, label: t.name, sub: `${t.points} pts`, swatch: t.color }))
          : drivers.map(d => ({ id: d.driverId, label: d.name, sub: `${d.points} pts`, image: d.flag }))}
        onClose={() => setSeasonPicker(null)}
        onPick={o => { const kind = seasonPicker!; setSeasonPicker(null); saveSeason(kind, o.id, o.label); }} />
    </ScrollView>
  );
}
