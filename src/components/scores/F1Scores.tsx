import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl, StyleSheet } from 'react-native';
import { getF1Weekend, getF1Calendar, getF1Standings, F1Weekend, F1Session, F1CalendarEntry, F1Standings } from '../../api/f1';
import { C, s, Toggle, RankedTable, Loading, Empty, ErrorRetry, localDayTime, useLiveRefresh } from './ui';

type View_ = 'weekend' | 'calendar' | 'drivers' | 'teams';

function SessionCard({ session, expanded, onPress }: { session: F1Session; expanded: boolean; onPress: () => void }) {
  const isRace = session.type === 'Race' || session.type === 'Sprint';
  const shown = expanded ? session.results : session.results.slice(0, isRace ? 3 : 1);
  return (
    <TouchableOpacity style={[f.session, session.state === 'live' && f.sessionLive]} onPress={onPress} activeOpacity={0.8}>
      <View style={f.sessionHead}>
        <Text style={[f.sessionName, isRace && { color: C.accent }]}>{session.label}</Text>
        <Text style={[f.sessionState, session.state === 'live' && { color: C.live }]}>
          {session.state === 'live' ? '● LIVE' : session.state === 'final' ? 'Finished' : localDayTime(session.start)}
        </Text>
      </View>
      {shown.map(r => (
        <View key={r.driverId} style={f.resultRow}>
          <Text style={[f.pos, r.position <= 3 && f.podium]}>{r.position}</Text>
          {r.flag ? <Image source={{ uri: r.flag }} style={f.flag} /> : null}
          <Text style={f.driver} numberOfLines={1}>{r.driver}</Text>
        </View>
      ))}
      {session.results.length > shown.length && (
        <Text style={f.more}>Show all {session.results.length} ▾</Text>
      )}
    </TouchableOpacity>
  );
}

function WeekendView({ entry, onPickCalendar }: { entry?: F1CalendarEntry; onPickCalendar: () => void }) {
  const [weekend, setWeekend] = useState<F1Weekend | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setError(false);
    try {
      setWeekend(await getF1Weekend(entry, force));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [entry?.name]);

  useEffect(() => { setWeekend(undefined); setExpanded(null); load(); }, [load]);
  useLiveRefresh(!!weekend?.sessions.some(x => x.state === 'live'), () => load(true));

  if (error) return <ErrorRetry text="Failed to load the race weekend." onRetry={() => load()} />;
  if (weekend === undefined) return <Loading />;
  if (weekend === null) return <Empty emoji="🏎️" text="No race weekend found" sub="Pick a race from the calendar" />;

  // Latest finished/live session first — that's what people want to see
  const sessions = [...weekend.sessions].reverse();
  return (
    <ScrollView contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
      <View style={f.hero}>
        <Text style={f.heroName}>{weekend.name}</Text>
        <Text style={f.heroSub}>{weekend.circuit}{weekend.location ? ` · ${weekend.location}` : ''}</Text>
        <TouchableOpacity onPress={onPickCalendar}><Text style={f.heroLink}>All races ›</Text></TouchableOpacity>
      </View>
      {sessions.map(x => (
        <SessionCard key={x.id} session={x} expanded={expanded === x.id}
          onPress={() => setExpanded(e => (e === x.id ? null : x.id))} />
      ))}
    </ScrollView>
  );
}

function CalendarView({ onPick }: { onPick: (e: F1CalendarEntry) => void }) {
  const [cal, setCal] = useState<F1CalendarEntry[] | null>(null);
  const [error, setError] = useState(false);
  const load = () => { setError(false); getF1Calendar().then(setCal).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <ErrorRetry text="Failed to load the calendar." onRetry={load} />;
  if (!cal) return <Loading />;
  const now = new Date().toISOString();
  const nextIdx = cal.findIndex(c => c.end >= now);
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {cal.map((c, i) => {
        const past = c.end < now;
        return (
          <TouchableOpacity key={c.name + c.start} style={[f.calRow, i === nextIdx && f.calNext]} onPress={() => onPick(c)}>
            <Text style={[f.calRound, past && { color: C.dim }]}>R{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[f.calName, past && { color: C.muted }]} numberOfLines={1}>{c.name}</Text>
              <Text style={f.calDate}>
                {new Date(c.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(c.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {i === nextIdx ? '  · Next' : ''}
              </Text>
            </View>
            <Text style={f.calArrow}>›</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function StandingsView({ kind }: { kind: 'drivers' | 'teams' }) {
  const [data, setData] = useState<F1Standings | null>(null);
  const [error, setError] = useState(false);
  const load = () => { setError(false); getF1Standings().then(setData).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <ErrorRetry text="Failed to load standings." onRetry={load} />;
  if (!data) return <Loading />;
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      {kind === 'drivers'
        ? <RankedTable columns={[{ label: 'Pts', width: 40, accent: true }]}
            rows={data.drivers.map(d => ({ key: d.driverId, rank: d.rank, name: d.name, image: d.flag, values: [d.points] }))} />
        : <RankedTable columns={[{ label: 'Pts', width: 40, accent: true }]}
            rows={data.constructors.map(t => ({ key: t.teamId, rank: t.rank, name: t.name, swatch: t.color, values: [t.points] }))} />}
    </ScrollView>
  );
}

export function F1Scores() {
  const [view, setView] = useState<View_>('weekend');
  const [entry, setEntry] = useState<F1CalendarEntry | undefined>(undefined);
  return (
    <View style={{ flex: 1 }}>
      <View style={f.bar}>
        <Toggle<View_> value={view} onChange={setView} options={[
          { key: 'weekend', label: 'Weekend' }, { key: 'calendar', label: 'Calendar' },
          { key: 'drivers', label: 'Drivers' }, { key: 'teams', label: 'Teams' },
        ]} />
      </View>
      {view === 'weekend' && <WeekendView entry={entry} onPickCalendar={() => setView('calendar')} />}
      {view === 'calendar' && <CalendarView onPick={e => { setEntry(e); setView('weekend'); }} />}
      {(view === 'drivers' || view === 'teams') && <StandingsView kind={view} />}
    </View>
  );
}

const f = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'flex-start' },
  hero: { paddingHorizontal: 16, paddingVertical: 14 },
  heroName: { color: C.text, fontSize: 18, fontWeight: '800' },
  heroSub: { color: C.faint, fontSize: 12, marginTop: 2 },
  heroLink: { color: C.accent, fontSize: 12, fontWeight: '700', marginTop: 8 },
  session: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  sessionLive: { borderColor: '#ef444455' },
  sessionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sessionName: { color: C.text, fontWeight: '800', fontSize: 14 },
  sessionState: { color: C.faint, fontSize: 12, fontWeight: '600' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  pos: { width: 22, color: C.muted, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  podium: { color: C.accent },
  flag: { width: 18, height: 12, resizeMode: 'cover', borderRadius: 2 },
  driver: { color: '#e5e7eb', fontSize: 13, fontWeight: '600', flex: 1 },
  more: { color: C.faint, fontSize: 11, marginTop: 4 },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  calNext: { backgroundColor: C.accentBg },
  calRound: { width: 30, color: C.accent, fontWeight: '800', fontSize: 12 },
  calName: { color: C.text, fontWeight: '700', fontSize: 13 },
  calDate: { color: C.faint, fontSize: 11, marginTop: 2 },
  calArrow: { color: C.faint, fontSize: 18 },
});
