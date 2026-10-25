import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, RefreshControl, StyleSheet } from 'react-native';
import { getUfcEvent, getUfcCalendar, UfcEvent, UfcCalendarEntry, UfcFight, UfcFighter } from '../../api/ufc';
import { C, s, ChipBar, Loading, Empty, ErrorRetry, localDayTime, useLiveRefresh } from './ui';

function Fighter({ f, align }: { f: UfcFighter; align: 'left' | 'right' }) {
  return (
    <View style={[u.fighter, align === 'right' && { alignItems: 'flex-end' }]}>
      <View style={[u.nameRow, align === 'right' && { flexDirection: 'row-reverse' }]}>
        {f.flag ? <Image source={{ uri: f.flag }} style={u.flag} /> : null}
        <Text style={[u.name, f.winner && u.winner]} numberOfLines={2}>{f.name}</Text>
      </View>
      <Text style={u.record}>{f.record}{f.winner ? '  ✓ WIN' : ''}</Text>
    </View>
  );
}

function FightCard({ fight, main }: { fight: UfcFight; main: boolean }) {
  return (
    <View style={[u.card, main && u.cardMain, fight.state === 'live' && { borderColor: '#ef444455' }]}>
      <Text style={[u.weight, main && { color: C.accent }]}>
        {main ? 'MAIN EVENT · ' : ''}{fight.weightClass.toUpperCase()}
        {fight.state === 'live' ? '  ● LIVE' : ''}
      </Text>
      <View style={u.row}>
        <Fighter f={fight.fighters[0]} align="left" />
        <Text style={u.vs}>vs</Text>
        <Fighter f={fight.fighters[1]} align="right" />
      </View>
    </View>
  );
}

export function UfcScores() {
  const [calendar, setCalendar] = useState<UfcCalendarEntry[]>([]);
  const [entry, setEntry] = useState<UfcCalendarEntry | undefined>(undefined);
  const [event, setEvent] = useState<UfcEvent | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { getUfcCalendar().then(setCalendar).catch(() => {}); }, []);

  const load = useCallback(async (force = false) => {
    setError(false);
    try {
      setEvent(await getUfcEvent(entry, force));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [entry?.name]);

  useEffect(() => { setEvent(undefined); load(); }, [load]);
  useLiveRefresh(!!event?.fights.some(x => x.state === 'live'), () => load(true));

  // Last 3 events and the next 5, around today
  const now = new Date().toISOString();
  const nextIdx = Math.max(0, calendar.findIndex(c => c.start >= now));
  const nearby = calendar.slice(Math.max(0, nextIdx - 3), nextIdx + 5);
  const currentName = entry?.name ?? event?.name;

  return (
    <View style={{ flex: 1 }}>
      {nearby.length > 0 && (
        <ChipBar items={nearby.map(c => ({ key: c.name, label: c.name.replace(/^UFC Fight Night:/, 'Fight Night:') }))}
          isActive={k => k === currentName} onPress={k => setEntry(nearby.find(c => c.name === k))} />
      )}
      {error ? <ErrorRetry text="Failed to load the fight card." onRetry={() => load()} />
        : event === undefined ? <Loading />
        : event === null ? <Empty emoji="🥊" text="Fight card not announced yet" sub={entry ? localDayTime(entry.start) : undefined} />
        : (
          <ScrollView contentContainerStyle={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
            <View style={u.hero}>
              <Text style={u.heroName}>{event.name}</Text>
              <Text style={u.heroSub}>{localDayTime(event.start)}{event.venue ? ` · ${event.venue}` : ''}</Text>
            </View>
            {event.fights.map((fight, i) => <FightCard key={fight.id} fight={fight} main={i === 0} />)}
          </ScrollView>
        )}
    </View>
  );
}

const u = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingVertical: 14 },
  heroName: { color: C.text, fontSize: 18, fontWeight: '800' },
  heroSub: { color: C.faint, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 4, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  cardMain: { borderColor: C.accent + '66' },
  weight: { color: C.faint, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  fighter: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { width: 18, height: 12, borderRadius: 2 },
  name: { color: C.muted, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  winner: { color: C.text, fontWeight: '800' },
  record: { color: C.faint, fontSize: 11, marginTop: 3 },
  vs: { color: C.dim, fontSize: 12, fontWeight: '700', marginHorizontal: 10 },
});
