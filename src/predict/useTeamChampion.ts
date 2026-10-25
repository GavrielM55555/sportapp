import { useCallback, useEffect, useState } from 'react';
import { getPostseason, getWinLossStandings, groupTeamSeries, TeamGame, TeamLeague } from '../api/teamsports';
import { Group } from '../types';
import { loadPicks, savePick, commitScores, hasStarted, PickDoc } from './store';

export const CHAMPION_POINTS = 10;

export interface ChampionPick extends PickDoc { teamId: number; teamName: string; season: string }
export interface TeamOption { id: number; name: string; logo: string }

/** NFL Super Bowl / MLB World Series pick: locks when the postseason starts,
 *  scored once the title is decided. Also exposes the postseason games. */
export function useTeamChampion(group: Group, league: TeamLeague, uid: string | undefined) {
  const season = Number(group.season) || new Date().getFullYear();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [postseason, setPostseason] = useState<TeamGame[] | null>(null);
  const [picks, setPicks] = useState<ChampionPick[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (force = false) => {
    const [standings, games, existing] = await Promise.all([
      getWinLossStandings(league.path).catch(() => []),
      getPostseason(league, season, force).catch(() => [] as TeamGame[]),
      loadPicks<ChampionPick>('championship_picks', group.id),
    ]);
    setTeams(standings.flatMap(g => g.rows).map(r => ({ id: r.teamId, name: r.teamName, logo: r.teamLogo }))
      .sort((a, b) => a.name.localeCompare(b.name)));
    setPostseason(games);

    // Score once the champion is known
    const champ = championOf(league, games);
    const unscored = champ === undefined ? [] : existing.filter(p => p.pointsEarned === undefined);
    if (unscored.length > 0) {
      const scored = await commitScores(group.id, unscored.map(p => ({
        col: 'championship_picks', id: p.id, points: p.teamId === champ ? CHAMPION_POINTS : 0,
      })));
      if (scored) {
        setPicks(await loadPicks<ChampionPick>('championship_picks', group.id));
        return;
      }
    }
    setPicks(existing);
  }, [group.id, league.key, season]);

  useEffect(() => { load(); }, [load]);

  const lockAt = postseason?.[0]?.kickoff;
  const locked = hasStarted(lockAt);
  const championId = postseason ? championOf(league, postseason) : undefined;

  const save = async (team: TeamOption) => {
    if (!uid || locked) return;
    setSaving(true);
    try {
      await savePick('championship_picks', uid, group.id, {}, { teamId: team.id, teamName: team.name, teamAbbr: team.name, season: String(season) });
      setPicks(await loadPicks<ChampionPick>('championship_picks', group.id));
    } finally {
      setSaving(false);
    }
  };

  return { teams, postseason, picks, locked, lockAt, championId, save, saving, reload: load };
}

/** Winner of the final (Super Bowl game / World Series), once decided */
function championOf(league: TeamLeague, games: TeamGame[]): number | undefined {
  if (league.key === 'nfl') {
    const sb = games.find(g => g.round === 'nfl_sb' && g.status === 'final' && g.homeScore !== null && g.awayScore !== null);
    return sb ? (sb.homeScore! > sb.awayScore! ? sb.homeTeam.id : sb.awayTeam.id) : undefined;
  }
  return groupTeamSeries(games).find(s => s.round === 'mlb_ws')?.winnerId;
}
