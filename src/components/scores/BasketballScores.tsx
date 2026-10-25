import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { getGamesByDates } from '../../api/nba';
import { getBasketballGamesByDate, getBasketballStandings, BASKETBALL_LEAGUES, BasketballGame, BasketballStandingRow } from '../../api/apibasketball';
import { usePreferences } from '../../hooks/usePreferences';
import { Game } from '../../types';
import {
  C, s, buildDates, TODAY_INDEX, DateStrip, ChipBar, SectionHeader, Toggle, TwoTeamCard,
  RankedTable, Loading, Empty, LiveBanner, useLiveRefresh,
} from './ui';

const DATES = buildDates();

function nbaLabel(g: Game): string {
  if (g.status === 'live') return g.period ? (g.period > 4 ? `OT${g.period > 5 ? g.period - 4 : ''}` : `Q${g.period}`) : 'LIVE';
  if (g.status === 'final') return g.isOT ? 'FT/OT' : 'FT';
  return g.time ?? '';
}

function otherLabel(g: BasketballGame): string {
  if (g.status === 'live') return g.elapsed ?? 'LIVE';
  if (g.status === 'final') return 'FT';
  if (!g.time) return '';
  const [h, m] = g.time.split(':').map(Number);
  const d = new Date(); d.setUTCHours(h, m);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** One league block with a Games / Table toggle */
function LeagueBlock({ leagueId, name, country, emoji, children }: {
  leagueId: number | 'nba'; name: string; country: string; emoji: string; children: React.ReactNode;
}) {
  const [view, setView] = useState<'games' | 'table'>('games');
  const [table, setTable] = useState<BasketballStandingRow[][] | null>(null);
  const [failed, setFailed] = useState(false);

  const show = (v: 'games' | 'table') => {
    setView(v);
    if (v === 'table' && !table) {
      setFailed(false);
      getBasketballStandings(leagueId).then(setTable).catch(() => setFailed(true));
    }
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <SectionHeader emoji={emoji} title={name} subtitle={country}
        right={<Toggle options={[{ key: 'games', label: 'Games' }, { key: 'table', label: 'Table' }]} value={view} onChange={show} />} />
      {view === 'games' ? children
        : failed ? <Empty text="Failed to load table" />
        : !table ? <ActivityIndicator color={C.accent} style={{ margin: 20 }} />
        : table.length === 0 ? <Empty text="No standings available" />
        : table.map((group, gi) => (
          <RankedTable key={gi}
            columns={[{ label: 'W' }, { label: 'L' }, { label: 'PCT', width: 40, accent: true }]}
            rows={group.map(r => ({ key: String(r.teamId), rank: r.rank, name: r.teamName, image: r.teamLogo, values: [r.win, r.lose, r.pct] }))} />
        ))}
    </View>
  );
}

export function BasketballScores() {
  const { prefs, toggleBasketballLeague } = usePreferences();
  const extraIds = prefs.basketballLeagueIds ?? [];
  const [dateIdx, setDateIdx] = useState(TODAY_INDEX);
  const [showNba, setShowNba] = useState(true);
  const [nba, setNba] = useState<Game[] | null>(null);
  const [extra, setExtra] = useState<BasketballGame[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const gen = useRef(0);
  const date = DATES[dateIdx].iso;

  const load = useCallback(async (force = false) => {
    const g = ++gen.current;
    if (!force) setNba(null);
    const [n, e] = await Promise.allSettled([
      getGamesByDates([date], force),
      extraIds.length ? getBasketballGamesByDate(date, extraIds) : Promise.resolve([]),
    ]);
    if (g !== gen.current) return;
    setNba(n.status === 'fulfilled' ? n.value : []);
    setExtra(e.status === 'fulfilled' ? e.value : []);
    setRefreshing(false);
  }, [date, extraIds.join(',')]);

  useEffect(() => { load(); }, [load]);
  const liveCount = (nba ?? []).filter(g => g.status === 'live').length + extra.filter(g => g.status === 'live').length;
  useLiveRefresh(liveCount > 0, () => load(true));

  return (
    <View style={{ flex: 1 }}>
      <ChipBar
        items={[{ key: 'nba', emoji: '🏀', label: 'NBA' }, ...BASKETBALL_LEAGUES.map(l => ({ key: l.id, emoji: l.logo, label: l.name }))]}
        isActive={k => (k === 'nba' ? showNba : extraIds.includes(k as number))}
        onPress={k => (k === 'nba' ? setShowNba(v => !v) : toggleBasketballLeague(k as number))}
      />
      <DateStrip dates={DATES} selected={dateIdx} onSelect={setDateIdx} />
      <LiveBanner count={liveCount} />
      {nba === null ? <Loading /> : (
        <ScrollView contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.accent} />}>
          {!showNba && extraIds.length === 0 && <Empty text="Select a league above" />}
          {showNba && (
            <LeagueBlock leagueId="nba" name="NBA" country="USA" emoji="🏀">
              {nba.length === 0 ? <Empty text="No NBA games on this date" /> : nba.map(g => (
                <TwoTeamCard key={g.id}
                  home={{ name: `${g.homeTeam.city} ${g.homeTeam.name}` }}
                  away={{ name: `${g.awayTeam.city} ${g.awayTeam.name}` }}
                  homeScore={g.homeScore} awayScore={g.awayScore} status={g.status} label={nbaLabel(g)} />
              ))}
            </LeagueBlock>
          )}
          {BASKETBALL_LEAGUES.filter(l => extraIds.includes(l.id)).map(l => {
            const games = extra.filter(g => g.leagueId === l.id);
            return (
              <LeagueBlock key={l.id} leagueId={l.id} name={l.name} country={l.country} emoji={l.logo}>
                {games.length === 0 ? <Text style={[s.emptySub, { padding: 16 }]}>No games on this date</Text> : games.map(g => (
                  <TwoTeamCard key={g.id} home={{ name: g.homeTeam.name, logo: g.homeTeam.logo }} away={{ name: g.awayTeam.name, logo: g.awayTeam.logo }}
                    homeScore={g.homeScore} awayScore={g.awayScore} status={g.status} label={otherLabel(g)} />
                ))}
              </LeagueBlock>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
