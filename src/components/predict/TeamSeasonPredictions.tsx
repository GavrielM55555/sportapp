import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Group } from '../../types';
import { getTeamGames, TeamGame, TeamLeague } from '../../api/teamsports';
import { useAuthContext } from '../../context/AuthContext';
import { loadPicks, savePick, commitScores, hasStarted, PickDoc } from '../../predict/store';
import { useTeamChampion, CHAMPION_POINTS } from '../../predict/useTeamChampion';
import { C, s, buildDates, TODAY_INDEX, DateStrip, Loading, Empty, localTime, localDayTime, useLiveRefresh } from '../scores/ui';
import { p, ScoringInfo, MembersReveal, ChampionCard, OptionPicker } from './ui';

export interface GamePick extends PickDoc {
  sport: string; kind: 'game' | 'series'; targetId: string;
  pickTeamId: number; pickTeamName: string; pickGames?: number;
  date?: string; kickoff?: string; round?: string;
}

export const SEASON_POINTS: Record<'nfl' | 'mlb', number> = { nfl: 2, mlb: 1 };
const DATES = buildDates();

/** Score every pick whose game has started, wherever it is in the season */
async function scoreSeasonPicks(group: Group, league: TeamLeague, picks: GamePick[]): Promise<boolean> {
  const due = picks.filter(x => x.kind === 'game' && x.pointsEarned === undefined && x.date && hasStarted(x.kickoff));
  // Newest 20 days per load keeps this cheap; older ones get scored on later loads
  const dates = [...new Set(due.map(x => x.date!))].sort().slice(-20);
  const byId = new Map<string, TeamGame>();
  await Promise.all(dates.map(async d => {
    for (const g of await getTeamGames(league, d).catch(() => [])) byId.set(String(g.id), g);
  }));
  const scores = due.flatMap(x => {
    const g = byId.get(x.targetId);
    if (!g || g.status !== 'final' || g.homeScore === null || g.awayScore === null) return [];
    const winner = g.homeScore > g.awayScore ? g.homeTeam.id : g.awayTeam.id;
    return [{ col: 'team_predictions', id: x.id, points: x.pickTeamId === winner ? SEASON_POINTS[league.key] : 0 }];
  });
  return commitScores(group.id, scores);
}

export function GameRow({ game, myPick, picks, group, onPick }: {
  game: TeamGame; myPick?: GamePick; picks: GamePick[]; group: Group;
  onPick: (g: TeamGame, teamId: number, teamName: string) => void;
}) {
  const locked = game.status !== 'scheduled' || hasStarted(game.kickoff);
  const winner = game.status === 'final' && game.homeScore !== null && game.awayScore !== null
    ? (game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id) : undefined;
  const sides = [game.awayTeam, game.homeTeam];
  return (
    <View style={p.block}>
      <View style={p.blockHead}>
        <View style={{ flex: 1 }}>
          <Text style={p.blockTitle}>{game.awayTeam.shortName} @ {game.homeTeam.shortName}</Text>
          {game.status === 'live' ? <Text style={p.live}>● LIVE {game.awayScore}–{game.homeScore} · {game.statusDetail}</Text>
            : game.status === 'final' ? <Text style={p.final}>FINAL {game.awayScore}–{game.homeScore}</Text>
            : <Text style={p.blockSub}>{localTime(game.kickoff)}{game.note ? ` · ${game.note}` : ''}</Text>}
        </View>
        <Text style={p.count}>{picks.length}/{group.members.length} picked</Text>
      </View>
      {!locked ? (
        <View style={p.teamBtns}>
          {sides.map(t => {
            const sel = myPick?.pickTeamId === t.id;
            return (
              <TouchableOpacity key={t.id} style={[p.teamBtn, sel && p.teamBtnSel]} onPress={() => onPick(game, t.id, t.shortName)}>
                {t.logo ? <Image source={{ uri: t.logo }} style={p.teamLogo} /> : null}
                <Text style={[p.teamBtnText, sel && p.teamBtnTextSel]}>{t.shortName}{sel ? ' ✓' : ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <MembersReveal members={group.members} pickFor={uid => {
          const x = picks.find(k => k.uid === uid);
          return x ? { label: x.pickTeamName, correct: winner === undefined ? undefined : x.pickTeamId === winner, points: x.pointsEarned } : null;
        }} />
      )}
    </View>
  );
}

/** NFL / MLB season group: pick any game's winner + the champion */
export function TeamSeasonPredictions({ group, league }: { group: Group; league: TeamLeague }) {
  const { user } = useAuthContext();
  const champ = useTeamChampion(group, league, user?.uid);
  const [dateIdx, setDateIdx] = useState(TODAY_INDEX);
  const [games, setGames] = useState<TeamGame[] | null>(null);
  const [picks, setPicks] = useState<GamePick[]>([]);
  const [showChamp, setShowChamp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const date = DATES[dateIdx].iso;
  const champName = league.key === 'nfl' ? 'Super Bowl' : 'World Series';

  const loadPicksAndScore = useCallback(async () => {
    const all = await loadPicks<GamePick>('team_predictions', group.id);
    const changed = await scoreSeasonPicks(group, league, all);
    setPicks(changed ? await loadPicks<GamePick>('team_predictions', group.id) : all);
  }, [group.id, league.key]);

  const loadGames = useCallback(async (force = false) => {
    if (!force) setGames(null);
    setGames(await getTeamGames(league, date, force).catch(() => []));
    setRefreshing(false);
  }, [league.key, date]);

  useEffect(() => { loadPicksAndScore(); }, [loadPicksAndScore]);
  useEffect(() => { loadGames(); }, [loadGames]);
  useLiveRefresh(!!games?.some(g => g.status === 'live'), () => loadGames(true));

  const pick = async (g: TeamGame, teamId: number, teamName: string) => {
    if (!user || hasStarted(g.kickoff)) return;
    // Optimistic: show the pick immediately, then save
    setPicks(prev => [...prev.filter(x => !(x.uid === user.uid && x.targetId === String(g.id))),
      { id: 'pending', uid: user.uid, groupId: group.id, sport: league.key, kind: 'game', targetId: String(g.id), pickTeamId: teamId, pickTeamName: teamName }]);
    await savePick('team_predictions', user.uid, group.id, { targetId: String(g.id) }, {
      sport: league.key, kind: 'game', pickTeamId: teamId, pickTeamName: teamName, date: g.date, kickoff: g.kickoff,
    });
    setPicks(await loadPicks<GamePick>('team_predictions', group.id));
  };

  const mine = picks.filter(x => x.uid === user?.uid && x.kind === 'game');
  const myScored = mine.filter(x => x.pointsEarned !== undefined);
  const myCorrect = myScored.filter(x => (x.pointsEarned ?? 0) > 0).length;
  const myChamp = champ.picks.find(x => x.uid === user?.uid);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGames(true); loadPicksAndScore(); champ.reload(true); }} tintColor={C.accent} />}>
      <ScoringInfo lines={[
        `Correct winner = ${SEASON_POINTS[league.key]} pt${SEASON_POINTS[league.key] > 1 ? 's' : ''}${league.key === 'mlb' ? ' · pick as many or as few games as you like' : ''}`,
        `${champName} champion = ${CHAMPION_POINTS} pts`,
      ]} />

      <ChampionCard
        title={`🏆 Pick the ${champName} champion`}
        lockText={champ.locked ? 'Locked — the playoffs have started'
          : champ.lockAt ? `Locks ${localDayTime(champ.lockAt)}` : 'Locks when the playoffs begin'}
        locked={champ.locked} myPickLabel={myChamp?.teamName} members={group.members} saving={champ.saving}
        pickFor={uid => {
          const x = champ.picks.find(k => k.uid === uid);
          return x ? { label: x.teamName, correct: champ.championId === undefined ? undefined : x.teamId === champ.championId, points: x.pointsEarned } : null;
        }}
        onOpen={() => setShowChamp(true)}
      />

      {myScored.length > 0 && (
        <Text style={[s.emptySub, { paddingHorizontal: 16 }]}>
          Your record: {myCorrect}/{myScored.length} correct · {Math.round((myCorrect / myScored.length) * 100)}%
        </Text>
      )}

      <DateStrip dates={DATES} selected={dateIdx} onSelect={setDateIdx} />
      {games === null ? <Loading />
        : games.length === 0 ? <Empty emoji={league.logo} text={`No ${league.name} games on this date`} />
        : games.map(g => (
          <GameRow key={g.id} game={g} group={group} onPick={pick}
            myPick={picks.find(x => x.uid === user?.uid && x.targetId === String(g.id))}
            picks={picks.filter(x => x.targetId === String(g.id))} />
        ))}

      <OptionPicker visible={showChamp} title={`🏆 ${champName} champion`} subtitle={`${CHAMPION_POINTS} pts if you're right`}
        options={champ.teams.map(t => ({ id: String(t.id), label: t.name, image: t.logo }))}
        onClose={() => setShowChamp(false)}
        onPick={o => { setShowChamp(false); const t = champ.teams.find(x => String(x.id) === o.id); if (t) champ.save(t); }} />
    </ScrollView>
  );
}
