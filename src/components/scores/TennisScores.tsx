import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, RefreshControl, StyleSheet } from 'react-native';
import { getTennisTournaments, Tour, TennisTournament, TennisMatch, TennisPlayer } from '../../api/tennis';
import { C, s, ChipBar, Toggle, Loading, Empty, ErrorRetry, LiveBanner, localDayTime, useLiveRefresh } from './ui';

function PlayerRow({ p, live }: { p: TennisPlayer; live: boolean }) {
  return (
    <View style={t.playerRow}>
      {p.flag ? <Image source={{ uri: p.flag }} style={t.flag} /> : <View style={t.flag} />}
      <Text style={[t.player, p.winner && t.winner]} numberOfLines={1}>
        {p.name}{p.seed ? <Text style={t.seed}>  ({p.seed})</Text> : null}
      </Text>
      {p.sets.map((set, i) => (
        <Text key={i} style={[t.set, p.winner && t.winner, live && i === p.sets.length - 1 && { color: C.accent }]}>
          {set.games}{set.tiebreak !== undefined && set.games < 7 ? <Text style={t.tb}>{set.tiebreak}</Text> : null}
        </Text>
      ))}
    </View>
  );
}

function MatchCard({ m }: { m: TennisMatch }) {
  const live = m.state === 'live';
  return (
    <View style={[t.card, live && { borderColor: '#ef444455' }]}>
      <View style={t.head}>
        <Text style={t.round}>{m.round}</Text>
        <Text style={[t.state, live && { color: C.live }]}>
          {live ? '● LIVE' : m.state === 'final' ? m.detail || 'Final' : localDayTime(m.start)}
        </Text>
      </View>
      <PlayerRow p={m.players[0]} live={live} />
      <PlayerRow p={m.players[1]} live={live} />
    </View>
  );
}

export function TennisScores() {
  const [tour, setTour] = useState<Tour>('atp');
  const [events, setEvents] = useState<TennisTournament[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    setError(false);
    try {
      const data = await getTennisTournaments(tour, force);
      setEvents(data);
      setSelected(prev => (prev && data.some(e => e.id === prev) ? prev : data[0]?.id ?? null));
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [tour]);

  useEffect(() => { setEvents(null); setSelected(null); load(); }, [load]);
  const current = events?.find(e => e.id === selected);
  const liveCount = current?.matches.filter(m => m.state === 'live').length ?? 0;
  useLiveRefresh(liveCount > 0, () => load(true));

  return (
    <View style={{ flex: 1 }}>
      <View style={t.bar}>
        <Toggle<Tour> value={tour} onChange={setTour} options={[{ key: 'atp', label: 'ATP' }, { key: 'wta', label: 'WTA' }]} />
      </View>
      {events && events.length > 0 && (
        <ChipBar items={events.map(e => ({ key: e.id, label: e.name }))} isActive={k => k === selected} onPress={k => setSelected(String(k))} />
      )}
      <LiveBanner count={liveCount} />
      {error ? <ErrorRetry text="Failed to load tournaments." onRetry={() => load()} />
        : events === null ? <Loading />
        : !current ? <Empty emoji="🎾" text="No tournaments this week" />
        : (
          <ScrollView contentContainerStyle={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
            {current.matches.map(m => <MatchCard key={m.id} m={m} />)}
          </ScrollView>
        )}
    </View>
  );
}

const t = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'flex-start' },
  card: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 3, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'transparent' },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  round: { color: C.faint, fontSize: 11, fontWeight: '700' },
  state: { color: C.faint, fontSize: 11, fontWeight: '600' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  flag: { width: 18, height: 12, borderRadius: 2 },
  player: { flex: 1, color: C.muted, fontSize: 13, fontWeight: '600' },
  winner: { color: C.text, fontWeight: '800' },
  seed: { color: C.faint, fontSize: 11, fontWeight: '500' },
  set: { width: 22, textAlign: 'center', color: C.muted, fontSize: 14, fontWeight: '700' },
  tb: { fontSize: 9 },
});
