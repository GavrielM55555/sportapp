import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Group } from '../../types';
import { groupTeamSeries, ROUND_INFO, PlayoffRoundCode, TeamGame, TeamLeague, TeamSeries } from '../../api/teamsports';
import { useAuthContext } from '../../context/AuthContext';
import { loadPicks, savePick, commitScores, hasStarted } from '../../predict/store';
import { useTeamChampion, CHAMPION_POINTS } from '../../predict/useTeamChampion';
import { C, Loading, Empty, localDayTime, useLiveRefresh } from '../scores/ui';
import { p, ScoringInfo, MembersReveal, ChampionCard, OptionPicker, SectionTitle } from './ui';
import { GameRow, GamePick } from './TeamSeasonPredictions';

// NFL: points per correct winner, by round
export const NFL_ROUND_POINTS: Partial<Record<PlayoffRoundCode, number>> = { nfl_wc: 2, nfl_div: 3, nfl_conf: 4, nfl_sb: 6 };
// MLB: [winner only, winner + exact games], by round
export const MLB_SERIES_POINTS: Partial<Record<PlayoffRoundCode, [number, number]>> = {
  mlb_wc: [1, 2], mlb_ds: [2, 4], mlb_cs: [3, 6], mlb_ws: [4, 8],
};

function scorePlayoffPicks(league: TeamLeague, games: TeamGame[], picks: GamePick[]) {
  const due = picks.filter(x => x.pointsEarned === undefined);
  if (league.key === 'nfl') {
    const byId = new Map(games.map(g => [String(g.id), g]));
    return due.flatMap(x => {
      const g = byId.get(x.targetId);
      if (!g || !g.round || g.status !== 'final' || g.homeScore === null || g.awayScore === null) return [];
      const winner = g.homeScore > g.awayScore ? g.homeTeam.id : g.awayTeam.id;
      return [{ col: 'team_predictions', id: x.id, points: x.pickTeamId === winner ? NFL_ROUND_POINTS[g.round] ?? 0 : 0 }];
    });
  }
  const series = new Map(groupTeamSeries(games).map(s => [s.id, s]));
  return due.flatMap(x => {
    const s = series.get(x.targetId);
    if (!s?.winnerId) return [];
    const [base, exact] = MLB_SERIES_POINTS[s.round] ?? [0, 0];
    const played = Object.values(s.wins).reduce((a, b) => a + b, 0);
    const points = x.pickTeamId !== s.winnerId ? 0 : x.pickGames === played ? exact : base;
    return [{ col: 'team_predictions', id: x.id, points }];
  });
}

function SeriesRow({ series, myPick, picks, group, onPick }: {
  series: TeamSeries; myPick?: GamePick; picks: GamePick[]; group: Group;
  onPick: (s: TeamSeries, teamId: number, teamName: string, games: number) => void;
}) {
  const locked = hasStarted(series.start);
  const need = Math.ceil((series.bestOf || 7) / 2);
  const lengths = Array.from({ length: (series.bestOf || 7) - need + 1 }, (_, i) => need + i);
  const [team, setTeam] = useState<number | undefined>(myPick?.pickTeamId);
  const [games, setGames] = useState<number | undefined>(myPick?.pickGames);
  const played = Object.values(series.wins).reduce((a, b) => a + b, 0);
  const [a, b] = series.teams;
  const status = series.winnerId
    ? `${series.teams.find(t => t.id === series.winnerId)?.shortName} wins in ${played}`
    : locked ? `${a.shortName} ${series.wins[a.id] ?? 0}–${series.wins[b.id] ?? 0} ${b.shortName}` : `Starts ${localDayTime(series.start)}`;

  return (
    <View style={p.block}>
      <View style={p.blockHead}>
        <View style={{ flex: 1 }}>
          <Text style={p.blockTitle}>{a.shortName} vs {b.shortName}</Text>
          <Text style={series.winnerId ? p.final : p.blockSub}>{status} · best of {series.bestOf || 7}</Text>
        </View>
        <Text style={p.count}>{picks.length}/{group.members.length} picked</Text>
      </View>
      {!locked ? (
        <>
          <View style={p.teamBtns}>
            {series.teams.map(t => (
              <TouchableOpacity key={t.id} style={[p.teamBtn, team === t.id && p.teamBtnSel]} onPress={() => setTeam(t.id)}>
                {t.logo ? <Image source={{ uri: t.logo }} style={p.teamLogo} /> : null}
                <Text style={[p.teamBtnText, team === t.id && p.teamBtnTextSel]}>{t.shortName}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={p.teamBtns}>
            {lengths.map(n => (
              <TouchableOpacity key={n} style={[p.teamBtn, games === n && p.teamBtnSel]} onPress={() => setGames(n)}>
                <Text style={[p.teamBtnText, games === n && p.teamBtnTextSel]}>in {n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {team !== undefined && games !== undefined && (team !== myPick?.pickTeamId || games !== myPick?.pickGames) && (
            <TouchableOpacity style={[p.pickBtn, { marginHorizontal: 12, marginBottom: 12 }]}
              onPress={() => onPick(series, team, series.teams.find(t => t.id === team)!.shortName, games)}>
              <Text style={p.pickBtnText}>Lock in pick</Text>
            </TouchableOpacity>
          )}
          {myPick && team === myPick.pickTeamId && games === myPick.pickGames && (
            <Text style={[p.blockSub, { paddingHorizontal: 12, paddingBottom: 12 }]}>✓ Saved: {myPick.pickTeamName} in {myPick.pickGames}</Text>
          )}
        </>
      ) : (
        <MembersReveal members={group.members} pickFor={uid => {
          const x = picks.find(k => k.uid === uid);
          return x ? {
            label: `${x.pickTeamName} in ${x.pickGames}`,
            correct: series.winnerId === undefined ? undefined : x.pickTeamId === series.winnerId,
            points: x.pointsEarned,
          } : null;
        }} />
      )}
    </View>
  );
}

/** NFL / MLB playoff group: every playoff game (NFL) or series (MLB) + the champion */
export function TeamPlayoffPredictions({ group, league }: { group: Group; league: TeamLeague }) {
  const { user } = useAuthContext();
  const champ = useTeamChampion(group, league, user?.uid);
  const [picks, setPicks] = useState<GamePick[] | null>(null);
  const [showChamp, setShowChamp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const games = champ.postseason;
  const champName = league.key === 'nfl' ? 'Super Bowl' : 'World Series';

  const load = useCallback(async () => {
    if (!games) return;
    const all = await loadPicks<GamePick>('team_predictions', group.id);
    const changed = await commitScores(group.id, scorePlayoffPicks(league, games, all));
    setPicks(changed ? await loadPicks<GamePick>('team_predictions', group.id) : all);
    setRefreshing(false);
  }, [group.id, league.key, games]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(!!games?.some(g => g.status === 'live'), () => champ.reload(true));

  const savePlayoffPick = async (targetId: string, data: Record<string, any>) => {
    if (!user) return;
    await savePick('team_predictions', user.uid, group.id, { targetId }, { sport: league.key, ...data });
    setPicks(await loadPicks<GamePick>('team_predictions', group.id));
  };

  const myChamp = champ.picks.find(x => x.uid === user?.uid);
  const pickList = picks ?? [];

  // Newest round on top
  const rounds = [...new Set((games ?? []).map(g => g.round!))].sort((x, y) => ROUND_INFO[y].order - ROUND_INFO[x].order);
  const series = league.key === 'mlb' ? groupTeamSeries(games ?? []) : [];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); champ.reload(true); }} tintColor={C.accent} />}>
      <ScoringInfo lines={league.key === 'nfl'
        ? ['Correct winner: Wild Card 2 · Divisional 3 · Conference 4 · Super Bowl 6', `Super Bowl champion pick = ${CHAMPION_POINTS} pts`]
        : ['Winner / winner + exact games: Wild Card 1/2 · Division 2/4 · Championship 3/6 · World Series 4/8', `World Series champion pick = ${CHAMPION_POINTS} pts`]} />

      <ChampionCard
        title={`🏆 Pick the ${champName} champion`}
        lockText={champ.locked ? 'Locked — the playoffs have started' : champ.lockAt ? `Locks ${localDayTime(champ.lockAt)}` : 'Locks when the playoffs begin'}
        locked={champ.locked} myPickLabel={myChamp?.teamName} members={group.members} saving={champ.saving}
        pickFor={uid => {
          const x = champ.picks.find(k => k.uid === uid);
          return x ? { label: x.teamName, correct: champ.championId === undefined ? undefined : x.teamId === champ.championId, points: x.pointsEarned } : null;
        }}
        onOpen={() => setShowChamp(true)}
      />

      {games === null || picks === null ? <Loading />
        : games.length === 0 ? <Empty emoji={league.logo} text="The playoffs haven't been set yet"
            sub={league.key === 'nfl' ? 'Playoff games appear here in January' : 'Playoff series appear here in late September'} />
        : rounds.map(r => (
          <View key={r}>
            <SectionTitle>🏆 {ROUND_INFO[r].label}</SectionTitle>
            {league.key === 'nfl'
              ? games.filter(g => g.round === r).map(g => (
                <GameRow key={g.id} game={g} group={group}
                  myPick={pickList.find(x => x.uid === user?.uid && x.targetId === String(g.id))}
                  picks={pickList.filter(x => x.targetId === String(g.id))}
                  onPick={(game, teamId, teamName) => !hasStarted(game.kickoff) && savePlayoffPick(String(game.id), {
                    kind: 'game', pickTeamId: teamId, pickTeamName: teamName, date: game.date, kickoff: game.kickoff, round: game.round,
                  })} />
              ))
              : series.filter(x => x.round === r).map(x => (
                <SeriesRow key={x.id} series={x} group={group}
                  myPick={pickList.find(k => k.uid === user?.uid && k.targetId === x.id)}
                  picks={pickList.filter(k => k.targetId === x.id)}
                  onPick={(sr, teamId, teamName, n) => !hasStarted(sr.start) && savePlayoffPick(sr.id, {
                    kind: 'series', pickTeamId: teamId, pickTeamName: teamName, pickGames: n, kickoff: sr.start, round: sr.round,
                  })} />
              ))}
          </View>
        ))}

      <OptionPicker visible={showChamp} title={`🏆 ${champName} champion`} subtitle={`${CHAMPION_POINTS} pts if you're right`}
        options={champ.teams.map(t => ({ id: String(t.id), label: t.name, image: t.logo }))}
        onClose={() => setShowChamp(false)}
        onPick={o => { setShowChamp(false); const t = champ.teams.find(x => String(x.id) === o.id); if (t) champ.save(t); }} />
    </ScrollView>
  );
}
