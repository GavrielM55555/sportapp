import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { getFootballGamesByDate, getStandings, SUPPORTED_LEAGUES, DEFAULT_LEAGUE_IDS, FootballGame, FootballLeague, StandingRow } from '../../api/apifootball';
import { usePreferences } from '../../hooks/usePreferences';
import {
  C, s, buildDates, TODAY_INDEX, DateStrip, ChipBar, SectionHeader, Toggle, TwoTeamCard,
  RankedTable, Loading, Empty, ErrorRetry, LiveBanner, useLiveRefresh, localTime,
} from './ui';

const DATES = buildDates();

function label(g: FootballGame): string {
  if (g.status === 'live') return g.elapsed ? `${g.elapsed}'` : g.statusDetail || 'LIVE';
  if (g.status === 'final') return 'FT';
  return g.kickoff ? localTime(g.kickoff) : 'TBD';
}

function LeagueBlock({ league, games }: { league: FootballLeague; games: FootballGame[] }) {
  const [view, setView] = useState<'games' | 'table'>('games');
  const [table, setTable] = useState<StandingRow[][] | null>(null);
  const [failed, setFailed] = useState(false);

  const show = (v: 'games' | 'table') => {
    setView(v);
    if (v === 'table' && !table) {
      setFailed(false);
      getStandings(league.id).then(setTable).catch(() => setFailed(true));
    }
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <SectionHeader emoji={league.logo} title={league.name} subtitle={league.country}
        right={<Toggle options={[{ key: 'games', label: 'Games' }, { key: 'table', label: 'Table' }]} value={view} onChange={show} />} />
      {view === 'games' ? games.map(g => (
          <TwoTeamCard key={g.id} home={{ name: g.homeTeam.name, logo: g.homeTeam.logo }} away={{ name: g.awayTeam.name, logo: g.awayTeam.logo }}
            homeScore={g.homeScore} awayScore={g.awayScore} status={g.status} label={label(g)} />
        ))
        : failed ? <Empty text="Failed to load table" />
        : !table ? <ActivityIndicator color={C.accent} style={{ margin: 20 }} />
        : table.length === 0 ? <Empty text="No standings available" sub="Cups and some leagues have no current table" />
        : table.map((group, gi) => (
          <RankedTable key={gi}
            columns={[{ label: 'P' }, { label: 'W' }, { label: 'D' }, { label: 'L' }, { label: 'GD' }, { label: 'Pts', accent: true }]}
            rows={group.map(r => ({
              key: String(r.teamId), rank: r.rank, name: r.teamName, image: r.teamLogo,
              values: [r.played, r.win, r.draw, r.lose, r.gd > 0 ? `+${r.gd}` : r.gd, r.points],
            }))} />
        ))}
    </View>
  );
}

export function FootballScores() {
  const { prefs } = usePreferences();
  const preferred = prefs.leagueIds.length > 0 ? prefs.leagueIds : DEFAULT_LEAGUE_IDS;
  const [selected, setSelected] = useState<number[]>(preferred);
  useEffect(() => { setSelected(preferred); }, [preferred.join(',')]);

  const [dateIdx, setDateIdx] = useState(TODAY_INDEX);
  const [games, setGames] = useState<FootballGame[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const gen = useRef(0);
  const date = DATES[dateIdx].iso;

  const load = useCallback(async (force = false) => {
    const g = ++gen.current;
    setError(false);
    if (!force) setGames(null);
    try {
      const all = await getFootballGamesByDate(date, selected);
      if (g === gen.current) setGames(all);
    } catch {
      if (g === gen.current) setError(true);
    } finally {
      if (g === gen.current) setRefreshing(false);
    }
  }, [date, selected.join(',')]);

  useEffect(() => { load(); }, [load]);
  const liveCount = (games ?? []).filter(g => g.status === 'live').length;
  useLiveRefresh(liveCount > 0, () => load(true));

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]);

  // Selected leagues first, then the rest, so favourites are always in view
  const chips = [...SUPPORTED_LEAGUES].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  const grouped = SUPPORTED_LEAGUES
    .filter(l => selected.includes(l.id))
    .map(league => ({ league, games: (games ?? []).filter(g => g.leagueId === league.id) }))
    .filter(x => x.games.length > 0);

  return (
    <View style={{ flex: 1 }}>
      <ChipBar items={chips.map(l => ({ key: l.id, emoji: l.logo, label: l.name }))}
        isActive={k => selected.includes(k as number)} onPress={k => toggle(k as number)} />
      <DateStrip dates={DATES} selected={dateIdx} onSelect={setDateIdx} />
      <LiveBanner count={liveCount} />
      {error ? <ErrorRetry text="Failed to load fixtures." onRetry={() => load()} />
        : games === null ? <Loading />
        : (
          <ScrollView contentContainerStyle={s.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
            {grouped.length === 0
              ? <Empty emoji="⚽" text="No fixtures on this date" sub="Try another day or add leagues above" />
              : grouped.map(({ league, games: lg }) => <LeagueBlock key={league.id} league={league} games={lg} />)}
          </ScrollView>
        )}
    </View>
  );
}
