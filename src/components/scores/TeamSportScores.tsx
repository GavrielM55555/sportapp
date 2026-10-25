import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { getTeamGames, getWinLossStandings, TeamGame, TeamLeague, WinLossRow } from '../../api/teamsports';
import {
  C, s, buildDates, TODAY_INDEX, DateStrip, SectionHeader, Toggle, TwoTeamCard,
  RankedTable, Loading, Empty, ErrorRetry, LiveBanner, useLiveRefresh, localTime,
} from './ui';

const DATES = buildDates();

function label(g: TeamGame): string {
  if (g.status === 'scheduled') return g.statusDetail === 'Postponed' ? 'PPD' : localTime(g.kickoff);
  return g.statusDetail || (g.status === 'final' ? 'Final' : 'LIVE');
}

/** NFL / MLB: games by date, plus win-loss standings */
export function TeamSportScores({ league }: { league: TeamLeague }) {
  const [view, setView] = useState<'games' | 'table'>('games');
  const [dateIdx, setDateIdx] = useState(TODAY_INDEX);
  const [games, setGames] = useState<TeamGame[] | null>(null);
  const [table, setTable] = useState<{ name: string; rows: WinLossRow[] }[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const gen = useRef(0);
  const date = DATES[dateIdx].iso;

  const load = useCallback(async (force = false) => {
    const g = ++gen.current;
    setError(false);
    if (!force) setGames(null);
    try {
      const data = await getTeamGames(league, date, force);
      if (g === gen.current) setGames(data);
    } catch {
      if (g === gen.current) setError(true);
    } finally {
      if (g === gen.current) setRefreshing(false);
    }
  }, [league.key, date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (view === 'table' && !table) getWinLossStandings(league.path).then(setTable).catch(() => setTable([]));
  }, [view, league.key]);

  const liveCount = (games ?? []).filter(g => g.status === 'live').length;
  useLiveRefresh(liveCount > 0 && view === 'games', () => load(true));

  return (
    <View style={{ flex: 1 }}>
      <SectionHeader emoji={league.logo} title={league.name} subtitle={league.country}
        right={<Toggle options={[{ key: 'games', label: 'Games' }, { key: 'table', label: 'Standings' }]} value={view} onChange={setView} />} />
      {view === 'table' ? (
        !table ? <ActivityIndicator color={C.accent} style={{ margin: 20 }} />
          : table.length === 0 ? <Empty text="No standings available" />
          : (
            <ScrollView contentContainerStyle={s.scroll}>
              {table.map(group => (
                <View key={group.name} style={{ marginBottom: 12 }}>
                  <Text style={[s.sectionSub, { paddingHorizontal: 16, paddingVertical: 8, textTransform: 'uppercase', fontWeight: '700' }]}>{group.name}</Text>
                  <RankedTable columns={[{ label: 'W' }, { label: 'L' }, { label: 'PCT', width: 42, accent: true }, { label: 'GB', width: 34 }]}
                    rows={group.rows.map((r, i) => ({ key: String(r.teamId), rank: i + 1, name: r.teamName, image: r.teamLogo, values: [r.win, r.lose, r.pct, r.gb] }))} />
                </View>
              ))}
            </ScrollView>
          )
      ) : (
        <>
          <DateStrip dates={DATES} selected={dateIdx} onSelect={setDateIdx} />
          <LiveBanner count={liveCount} />
          {error ? <ErrorRetry text="Failed to load games." onRetry={() => load()} />
            : games === null ? <Loading />
            : (
              <ScrollView contentContainerStyle={s.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
                {games.length === 0
                  ? <Empty emoji={league.logo} text={`No ${league.name} games on this date`} />
                  : games.map(g => (
                    <TwoTeamCard key={g.id} homeFirst={false}
                      home={{ name: g.homeTeam.name, logo: g.homeTeam.logo }} away={{ name: g.awayTeam.name, logo: g.awayTeam.logo }}
                      homeScore={g.homeScore} awayScore={g.awayScore} status={g.status} label={label(g)} note={g.note} />
                  ))}
              </ScrollView>
            )}
        </>
      )}
    </View>
  );
}
