import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
} from 'react-native';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Game, GamePrediction, Group, PlayoffSeries, SeriesPrediction, FootballPrediction, FootballResult } from '../types';
import { getGamesByDates, getPlayoffGames, groupIntoSeries, currentNBASeason, playoffCache } from '../api/balldontlie';
import { getFootballGamesByDate, SUPPORTED_LEAGUES, FootballGame } from '../api/apifootball';
import { PredictGameModal } from './PredictGameModal';
import { PredictSeriesModal } from './PredictSeriesModal';
import { useAuthContext } from '../context/AuthContext';

interface Props {
  group: Group;
}

export function GroupPredictionsTab({ group }: Props) {
  if (group.type === 'season') return <SeasonPredictions group={group} />;
  if (group.type === 'football') return <FootballPredictions group={group} />;
  return <PlayoffPredictions group={group} />;
}

// ── Simple in-memory cache for game fetches (avoids re-fetching on re-renders) ─
const gamesCache = new Map<string, { games: Game[]; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

async function fetchGamesForRange(startDate: string, endDate: string): Promise<Game[]> {
  const key = `${startDate}::${endDate}`;
  const cached = gamesCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.games;
  const games = await getGamesByDates([startDate, endDate]);
  gamesCache.set(key, { games, ts: Date.now() });
  return games;
}

// ── Scoring ───────────────────────────────────────────────────────────────

function calcGamePoints(pred: GamePrediction, game: Game): number {
  if (game.homeScore === null || game.awayScore === null) return 0;
  const actualWinner = game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id;
  let pts = 0;
  if (pred.predictedWinnerTeamId === actualWinner) pts += 2;
  if (pred.predictedHomeScore !== undefined && pred.predictedAwayScore !== undefined) {
    const homeDiff = Math.abs(pred.predictedHomeScore - game.homeScore);
    const awayDiff = Math.abs(pred.predictedAwayScore - game.awayScore);
    if (homeDiff === 0 && awayDiff === 0) {
      pts += 5; // exact score
    } else if (homeDiff <= 10 && awayDiff <= 10) {
      pts += 2; // within ±10
    }
  }
  return pts;
}

/** Score any unscored predictions for final games and update group member totals */
async function scoreFinishedGames(group: Group, finalGames: Game[], allPreds: GamePrediction[]) {
  const unscoredPreds = allPreds.filter(
    p => p.pointsEarned === undefined && finalGames.some(g => g.id === p.gameId)
  );
  if (unscoredPreds.length === 0) return;

  // Calculate points for newly scored predictions
  const newScores = new Map<string, number>(); // predId → pts
  for (const pred of unscoredPreds) {
    const game = finalGames.find(g => g.id === pred.gameId)!;
    newScores.set(pred.id!, calcGamePoints(pred, game));
  }

  // Build accurate totalPoints per uid using all predictions
  // (already scored ones keep their value; newly scored use calculated value)
  const totalByUid = new Map<string, number>();
  for (const pred of allPreds) {
    const pts = newScores.has(pred.id!) ? newScores.get(pred.id!)! : (pred.pointsEarned ?? 0);
    totalByUid.set(pred.uid, (totalByUid.get(pred.uid) ?? 0) + pts);
  }

  // Write everything in one batch
  const batch = writeBatch(db);
  for (const [predId, pts] of newScores) {
    batch.update(doc(db, 'predictions', predId), { pointsEarned: pts });
  }
  const updatedMembers = group.members.map(m => ({
    ...m,
    totalPoints: totalByUid.get(m.uid) ?? m.totalPoints,
  }));
  batch.update(doc(db, 'groups', group.id), { members: updatedMembers });

  await batch.commit();
}

// ── Season: today's games, predict before tip-off ────────────────────────

function SeasonPredictions({ group }: { group: Group }) {
  const { user } = useAuthContext();
  const [games, setGames] = useState<Game[]>([]);
  const [allPredictions, setAllPredictions] = useState<GamePrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Date range: yesterday → tomorrow (1 API call covers all 3 days)
  function getDateRange(): { start: string; end: string } {
    const offset = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().split('T')[0];
    };
    return { start: offset(-1), end: offset(1) };
  }

  async function loadData() {
    if (!user) return; // wait for auth to resolve
    setError(null);
    try {
      const { start, end } = getDateRange();
      const allGames = await fetchGamesForRange(start, end);
      setGames(allGames);

      // Fetch ALL predictions for this group (simpler, no gameId filter needed)
      const snap = await getDocs(query(
        collection(db, 'predictions'),
        where('groupId', '==', group.id)
      ));
      const preds = snap.docs.map(d => ({ id: d.id, ...d.data() } as GamePrediction));

      // Auto-score finished games
      const finalGames = allGames.filter(g => g.status === 'final');
      if (finalGames.length > 0) {
        await scoreFinishedGames(group, finalGames, preds);
        const rescored = await getDocs(query(
          collection(db, 'predictions'),
          where('groupId', '==', group.id)
        ));
        setAllPredictions(rescored.docs.map(d => ({ id: d.id, ...d.data() } as GamePrediction)));
      } else {
        setAllPredictions(preds);
      }
    } catch (e: any) {
      console.error('[SeasonPredictions] load error:', e);
      setError(e?.message?.includes('429')
        ? 'Too many requests — please wait a moment and try again.'
        : `Failed to load games: ${e?.message ?? 'Check your connection.'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [group.id, user?.uid, refreshKey]);

  // Auto-refresh live games every 60 seconds
  useEffect(() => {
    const hasLive = games.some(g => g.status === 'live');
    if (!hasLive) return;
    const interval = setInterval(() => {
      // Bust cache so we get fresh live scores
      gamesCache.clear();
      setRefreshKey(k => k + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, [games]);

  if (loading) return <ActivityIndicator color="#f97316" style={styles.loader} />;

  if (error) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>⚠️ {error}</Text>
        <TouchableOpacity
          style={{ marginTop: 16, backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          onPress={() => { setLoading(true); setRefreshKey(k => k + 1); }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const upcomingGames = games.filter(g => g.status === 'scheduled');
  const liveGames = games.filter(g => g.status === 'live');
  const finalGames = games.filter(g => g.status === 'final');
  const myPredictions = allPredictions.filter(p => p.uid === user?.uid);

  const RevealTable = ({ game }: { game: Game }) => {
    const lockedPicks = allPredictions.filter(p => p.gameId === game.id);
    const actualWinnerId = game.status === 'final' && game.homeScore !== null && game.awayScore !== null
      ? (game.homeScore > game.awayScore ? game.homeTeam.id : game.awayTeam.id)
      : null;
    return (
      <View key={game.id} style={styles.gameBlock}>
        <View style={styles.gameHeader}>
          <View style={styles.gameTeams}>
            <Text style={styles.gameMatchup}>
              {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
            </Text>
            {game.status === 'live' && (
              <Text style={styles.gameLive}>
                ● LIVE{game.period ? `  Q${game.period}` : ''}
                {game.homeScore !== null ? `  ${game.awayScore}–${game.homeScore}` : ''}
              </Text>
            )}
            {game.status === 'final' && (
              <Text style={styles.gameFinal}>FINAL  {game.awayScore}–{game.homeScore}</Text>
            )}
          </View>
          <Text style={styles.deadlinePassed}>{lockedPicks.length}/{group.members.length} picked</Text>
        </View>
        <View style={styles.revealTable}>
          {group.members.map(member => {
            const pick = lockedPicks.find(p => p.uid === member.uid);
            if (!pick) return (
              <View key={member.uid} style={styles.revealRow}>
                <Text style={styles.revealName}>{member.displayName}</Text>
                <Text style={styles.revealNoPick}>No pick</Text>
              </View>
            );
            const pickedAbbr = pick.predictedWinnerTeamId === game.homeTeam.id
              ? game.homeTeam.abbreviation : game.awayTeam.abbreviation;
            const correct = actualWinnerId !== null && pick.predictedWinnerTeamId === actualWinnerId;
            const wrong = actualWinnerId !== null && pick.predictedWinnerTeamId !== actualWinnerId;
            return (
              <View key={member.uid} style={styles.revealRow}>
                <Text style={styles.revealName}>{member.displayName}</Text>
                <View style={[styles.revealPick,
                  correct ? styles.revealCorrect : wrong ? styles.revealWrong : styles.revealLive]}>
                  <Text style={styles.revealPickText}>{pickedAbbr}</Text>
                  {pick.predictedHomeScore !== undefined && (
                    <Text style={styles.revealScore}>{pick.predictedAwayScore}–{pick.predictedHomeScore}</Text>
                  )}
                </View>
                {pick.pointsEarned !== undefined
                  ? <Text style={styles.revealPts}>+{pick.pointsEarned} pts</Text>
                  : <Text style={styles.revealPending}>–</Text>}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Scoring info ── */}
      <View style={styles.scoringInfo}>
        <Text style={styles.scoringInfoText}>📊 Scoring: Correct winner = 2 pts · Exact score = +5 pts · Within ±10 = +2 pts</Text>
      </View>

      {/* ── Live Now ── */}
      {liveGames.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: '#ef4444' }]}>🔴 Live Now</Text>
            <Text style={styles.liveRefresh}>auto-refreshes every 60s</Text>
          </View>
          {liveGames.map(game => <RevealTable key={game.id} game={game} />)}
        </>
      )}

      {/* ── Upcoming: make picks ── */}
      <Text style={styles.sectionHeader}>🏀 Upcoming — Make your picks</Text>
      {upcomingGames.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptySubtext}>No upcoming games right now.</Text>
        </View>
      ) : (
        upcomingGames.map(game => {
          const myPick = myPredictions.find(p => p.gameId === game.id);
          return (
            <View key={game.id} style={styles.gameBlock}>
              <View style={styles.gameHeader}>
                <View style={styles.gameTeams}>
                  <Text style={styles.gameMatchup}>
                    {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                  </Text>
                  <Text style={styles.gameTime}>
                    {new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {game.time ? `  ·  ${game.time}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.pickBtn, myPick && styles.pickBtnDone]}
                  onPress={() => setSelectedGame(game)}
                >
                  <Text style={styles.pickBtnText}>
                    {myPick
                      ? (myPick.predictedWinnerTeamId === game.homeTeam.id
                          ? game.homeTeam.abbreviation
                          : game.awayTeam.abbreviation) + ' ✓'
                      : 'Pick'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      {/* ── Recent Results (last 3 days) ── */}
      {finalGames.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { marginTop: 16 }]}>📊 Recent Results</Text>
          {finalGames.map(game => <RevealTable key={game.id} game={game} />)}
        </>
      )}

      {selectedGame && (
        <PredictGameModal
          game={selectedGame}
          groupId={group.id}
          onClose={() => setSelectedGame(null)}
          onSaved={() => { setSelectedGame(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </ScrollView>
  );
}

// ── Detect playoff rounds using fixed NBA bracket structure ───────────────
// NBA playoffs always have 8 → 4 → 2 → 1 series per round.
// We sort all series by their earliest game date (Round 2 always starts
// after Round 1, etc.) then slice by the known sizes.
// If fewer than 8 series exist yet, everything goes into Round 1 until
// enough series accumulate to fill it.
const ROUND_SIZES = [8, 4, 2, 1]; // R1, R2, Conf Finals, Finals

function detectRounds(allSeries: PlayoffSeries[]): PlayoffSeries[][] {
  if (allSeries.length === 0) return [];

  // Sort by earliest game date so later rounds appear after earlier ones
  const sorted = [...allSeries].sort((a, b) => {
    const aDate = a.games[0]?.date ?? '';
    const bDate = b.games[0]?.date ?? '';
    return aDate.localeCompare(bDate);
  });

  const rounds: PlayoffSeries[][] = [];
  let remaining = sorted;

  for (const size of ROUND_SIZES) {
    if (remaining.length === 0) break;
    // Take up to `size` series for this round
    rounds.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }

  // Safety: if somehow more series than expected, add them to a final group
  if (remaining.length > 0) rounds.push(remaining);

  return rounds;
}

const ROUND_LABELS = ['Round 1', 'Round 2', 'Conference Finals', 'NBA Finals'];

// Champion pick points by team abbreviation (based on 2026 playoff seeding)
const CHAMP_POINTS: Record<string, number> = {
  'OKC': 1,
  'SAS': 2, 'BOS': 2,
  'DET': 3, 'DEN': 3,
  'CLE': 4, 'NYK': 4,
  'HOU': 5, 'MIN': 5,
  'LAL': 6, 'ATL': 6,
  'PHI': 7,
  'TOR': 8,
  'POR': 9,
  'PHX': 10, 'ORL': 10,
};

// ── Playoff: rounds with lock-all-on-tipoff logic ────────────────────────

// ── Series scoring by round ───────────────────────────────────────────────
// R1: 1pt winner, 3pts winner+games
// R2: 1.5pt winner, 4.5pts winner+games
// R3: 2.5pt winner, 6pts winner+games
// Finals: 3.5pt winner, 9pts winner+games
const ROUND_SCORING = [
  { winner: 1,   exact: 3   },
  { winner: 1.5, exact: 4.5 },
  { winner: 2.5, exact: 6   },
  { winner: 3.5, exact: 9   },
];

function calcSeriesPoints(roundIndex: number, correctWinner: boolean, correctGames: boolean): number {
  if (!correctWinner) return 0;
  const s = ROUND_SCORING[roundIndex] ?? ROUND_SCORING[0];
  return correctGames ? s.exact : s.winner;
}

function PlayoffPredictions({ group }: { group: Group }) {
  const { user } = useAuthContext();
  const [allSeries, setAllSeries] = useState<PlayoffSeries[]>([]);
  const [allPredictions, setAllPredictions] = useState<SeriesPrediction[]>([]);
  const [champPicks, setChampPicks] = useState<{ id: string; uid: string; teamId: number; teamAbbr: string; pointsEarned?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<PlayoffSeries | null>(null);
  // Championship pick state
  const [showChampModal, setShowChampModal] = useState(false);
  const [savingChamp, setSavingChamp] = useState(false);

  // Round 2 OT bonus state
  const [otPicks, setOtPicks] = useState<{ id: string; uid: string; otGames: number; pointsEarned?: number }[]>([]);
  const [showOtModal, setShowOtModal] = useState(false);
  const [otInput, setOtInput] = useState('0');
  const [savingOt, setSavingOt] = useState(false);

  // Round 3 point-diff bonus state
  const [r3Picks, setR3Picks] = useState<{ id: string; uid: string; pointDiff: number; pointsEarned?: number }[]>([]);
  const [showR3Modal, setShowR3Modal] = useState(false);
  const [r3Input, setR3Input] = useState('1');
  const [savingR3, setSavingR3] = useState(false);
  const [showR3ScoreModal, setShowR3ScoreModal] = useState(false);
  const [r3ActualInput, setR3ActualInput] = useState('1');
  const [savingR3Score, setSavingR3Score] = useState(false);

  const silentReload = React.useCallback(async () => {
    if (!user) return;
    try {
      const games = await getPlayoffGames(currentNBASeason());
      const grouped = groupIntoSeries(games).filter(s => s.games.length >= 2);
      setAllSeries(grouped);
    } catch (e) {
      // silent — don't show error on background refresh
    }
  }, [user, group.id]);

  useEffect(() => {
    async function load() {
      if (!user) return; // wait for auth to resolve
      setError(null);
      try {
        const games = await getPlayoffGames(currentNBASeason());
        // Filter out Play-In games (single-game matchups, not real series)
        const grouped = groupIntoSeries(games).filter(s => s.games.length >= 2);
        setAllSeries(grouped);

        const snap = await getDocs(query(
          collection(db, 'series_predictions'),
          where('groupId', '==', group.id)
        ));
        const preds = snap.docs.map(d => ({ id: d.id, ...d.data() } as SeriesPrediction));

        // Auto-score completed series that haven't been scored yet
        const rounds = detectRounds(grouped);
        const unscoredPreds = preds.filter(p => p.pointsEarned === undefined && grouped.some(s => s.id === p.seriesId && s.isComplete));
        if (unscoredPreds.length > 0) {
          const batch = writeBatch(db);
          const newScores = new Map<string, number>();
          for (const pred of unscoredPreds) {
            const series = grouped.find(s => s.id === pred.seriesId)!;
            const roundIndex = rounds.findIndex(r => r.some(s => s.id === series.id));
            const correctWinner = series.winner?.id === pred.predictedWinnerTeamId;
            const correctGames = series.totalGames === pred.predictedGames;
            newScores.set(pred.id!, calcSeriesPoints(roundIndex, correctWinner, correctGames));
          }
          // Accumulate only the new points (delta)
          const totalByUid = new Map<string, number>();
          for (const [predId, pts] of newScores) {
            const pred = unscoredPreds.find(p => p.id === predId);
            if (pred) totalByUid.set(pred.uid, (totalByUid.get(pred.uid) ?? 0) + pts);
          }
          for (const [predId, pts] of newScores) {
            batch.update(doc(db, 'series_predictions', predId), { pointsEarned: pts });
          }
          const updatedMembers = group.members.map(m => ({
            ...m,
            totalPoints: (m.totalPoints ?? 0) + (totalByUid.get(m.uid) ?? 0),
          }));
          batch.update(doc(db, 'groups', group.id), { members: updatedMembers });
          await batch.commit();

          const rescored = await getDocs(query(collection(db, 'series_predictions'), where('groupId', '==', group.id)));
          setAllPredictions(rescored.docs.map(d => ({ id: d.id, ...d.data() } as SeriesPrediction)));
        } else {
          setAllPredictions(preds);
        }

        const champSnap = await getDocs(query(
          collection(db, 'championship_picks'),
          where('groupId', '==', group.id)
        ));
        const fetchedChampPicks = champSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; teamId: number; teamAbbr: string; pointsEarned?: number }));
        setChampPicks(fetchedChampPicks);

        // Auto-score championship picks when NBA Finals series is complete
        const champRounds = detectRounds(grouped);
        const finalsSeries = champRounds[3]?.[0];
        const champion = finalsSeries?.isComplete ? finalsSeries.winner : undefined;
        if (champion) {
          const unscoredChamp = fetchedChampPicks.filter(p => p.pointsEarned === undefined);
          if (unscoredChamp.length > 0) {
            const champBatch = writeBatch(db);
            const champDeltaByUid = new Map<string, number>();
            for (const pick of unscoredChamp) {
              const pts = pick.teamId === champion.id ? (CHAMP_POINTS[pick.teamAbbr] ?? 5) : 0;
              champBatch.update(doc(db, 'championship_picks', pick.id), { pointsEarned: pts });
              if (pts > 0) champDeltaByUid.set(pick.uid, (champDeltaByUid.get(pick.uid) ?? 0) + pts);
            }
            if (champDeltaByUid.size > 0) {
              const updatedMems = group.members.map(m => ({
                ...m,
                totalPoints: (m.totalPoints ?? 0) + (champDeltaByUid.get(m.uid) ?? 0),
              }));
              champBatch.update(doc(db, 'groups', group.id), { members: updatedMems });
            }
            await champBatch.commit();
            const rescoredChamp = await getDocs(query(collection(db, 'championship_picks'), where('groupId', '==', group.id)));
            setChampPicks(rescoredChamp.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; teamId: number; teamAbbr: string; pointsEarned?: number })));
          }
        }

        // Load Round 2 OT picks
        const otSnap = await getDocs(query(
          collection(db, 'playoff_bonus_picks'),
          where('groupId', '==', group.id)
        ));
        const fetchedOtPicks = otSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; otGames: number; pointsEarned?: number }));
        setOtPicks(fetchedOtPicks);

        // Load Round 3 point-diff picks
        const r3Snap = await getDocs(query(collection(db, 'playoff_r3_bonus_picks'), where('groupId', '==', group.id)));
        const fetchedR3Picks = r3Snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; pointDiff: number; pointsEarned?: number }));
        setR3Picks(fetchedR3Picks);

        // Auto-score Round 2 OT bonus when Round 2 is complete
        const r2 = detectRounds(grouped)[1] ?? [];
        const r2Complete = r2.length === 4 && r2.every(s => s.isComplete);
        if (r2Complete) {
          const unscoredOt = fetchedOtPicks.filter(p => p.pointsEarned === undefined);
          if (unscoredOt.length > 0) {
            // Force fresh data so isOT flags are current (avoids stale-cache mis-scoring)
            playoffCache.clear();
            const freshGames = await getPlayoffGames(currentNBASeason());
            const freshR2 = (detectRounds(groupIntoSeries(freshGames).filter(s => s.games.length >= 2))[1] ?? []);
            const actualOt = freshR2.flatMap(s => s.games).filter(g => g.status === 'final' && g.isOT).length;
            const otBatch = writeBatch(db);
            const deltaByUid = new Map<string, number>();
            for (const pick of unscoredOt) {
              const pts = pick.otGames === actualOt ? 4 : 0;
              otBatch.update(doc(db, 'playoff_bonus_picks', pick.id), { pointsEarned: pts });
              if (pts > 0) deltaByUid.set(pick.uid, (deltaByUid.get(pick.uid) ?? 0) + pts);
            }
            if (deltaByUid.size > 0) {
              const updatedMems = group.members.map(m => ({
                ...m,
                totalPoints: (m.totalPoints ?? 0) + (deltaByUid.get(m.uid) ?? 0),
              }));
              otBatch.update(doc(db, 'groups', group.id), { members: updatedMems });
            }
            await otBatch.commit();
            const rescored = await getDocs(query(collection(db, 'playoff_bonus_picks'), where('groupId', '==', group.id)));
            setOtPicks(rescored.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; otGames: number; pointsEarned?: number })));
          }

          // Fix any picks with corrupt pointsEarned values (1 or 2) from the brief scoring confusion
          const wrongOt = fetchedOtPicks.filter(p => p.pointsEarned !== undefined && p.pointsEarned !== 0 && p.pointsEarned !== 4);
          if (wrongOt.length > 0) {
            const ACTUAL_R2_OT = 1;
            const fixBatch = writeBatch(db);
            const fixDeltaByUid = new Map<string, number>();
            for (const pick of wrongOt) {
              const correctPts = pick.otGames === ACTUAL_R2_OT ? 4 : 0;
              const delta = correctPts - pick.pointsEarned!;
              fixBatch.update(doc(db, 'playoff_bonus_picks', pick.id), { pointsEarned: correctPts });
              if (delta !== 0) fixDeltaByUid.set(pick.uid, (fixDeltaByUid.get(pick.uid) ?? 0) + delta);
            }
            if (fixDeltaByUid.size > 0) {
              const updatedMems = group.members.map(m => ({
                ...m,
                totalPoints: (m.totalPoints ?? 0) + (fixDeltaByUid.get(m.uid) ?? 0),
              }));
              fixBatch.update(doc(db, 'groups', group.id), { members: updatedMems });
            }
            await fixBatch.commit();
            const fixRescored = await getDocs(query(collection(db, 'playoff_bonus_picks'), where('groupId', '==', group.id)));
            setOtPicks(fixRescored.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; otGames: number; pointsEarned?: number })));
          }
        }
      } catch (e: any) {
        console.error('[PlayoffPredictions] load error:', e);
        setError(e?.message?.includes('429')
          ? 'Too many requests — please wait a moment and try again.'
          : `Failed to load playoff data: ${e?.message ?? 'Check your connection.'}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [group.id, user?.uid]);

  // Auto-refresh every 5 min silently, but only before playoffs start (to catch tip-off and lock picks)
  useEffect(() => {
    const playoffsStarted = allSeries.some(s => s.games.some(g => g.status !== 'scheduled'));
    if (playoffsStarted || allSeries.length === 0) return;
    const interval = setInterval(() => {
      playoffCache.clear();
      silentReload();
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [allSeries, silentReload]);

  if (loading) return <ActivityIndicator color="#f97316" style={styles.loader} />;

  if (error) {
    return <View style={styles.empty}><Text style={styles.emptyText}>⚠️ {error}</Text></View>;
  }

  if (allSeries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No playoff series yet.</Text>
        <Text style={styles.emptySubtext}>Check back once the bracket is set.</Text>
      </View>
    );
  }

  const rounds = detectRounds(allSeries);
  const myPredictions = allPredictions.filter(p => p.uid === user?.uid);
  const playoffsStarted = allSeries.some(s => s.games.some(g => g.status !== 'scheduled'));

  const saveChamp = async (teamId: number, teamAbbr: string) => {
    if (!user) return;
    setSavingChamp(true);
    try {
      const pick = { uid: user.uid, groupId: group.id, teamId, teamAbbr, season: String(currentNBASeason()), submittedAt: Date.now() };
      const existing = await getDocs(query(collection(db, 'championship_picks'), where('uid', '==', user.uid), where('groupId', '==', group.id)));
      if (!existing.empty) {
        await updateDoc(doc(db, 'championship_picks', existing.docs[0].id), pick);
      } else {
        await addDoc(collection(db, 'championship_picks'), pick);
      }
      const snap = await getDocs(query(collection(db, 'championship_picks'), where('groupId', '==', group.id)));
      setChampPicks(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; teamId: number; teamAbbr: string; pointsEarned?: number })));
      setShowChampModal(false);
    } finally {
      setSavingChamp(false);
    }
  };


  const saveOtPick = async () => {
    if (!user) return;
    setSavingOt(true);
    try {
      const val = Math.max(0, parseInt(otInput) || 0);
      const pick = { uid: user.uid, groupId: group.id, season: String(currentNBASeason()), otGames: val, submittedAt: Date.now() };
      const existing = await getDocs(query(
        collection(db, 'playoff_bonus_picks'),
        where('uid', '==', user.uid),
        where('groupId', '==', group.id)
      ));
      if (!existing.empty) {
        await updateDoc(doc(db, 'playoff_bonus_picks', existing.docs[0].id), pick);
      } else {
        await addDoc(collection(db, 'playoff_bonus_picks'), pick);
      }
      const snap = await getDocs(query(collection(db, 'playoff_bonus_picks'), where('groupId', '==', group.id)));
      setOtPicks(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; otGames: number; pointsEarned?: number })));
      setShowOtModal(false);
    } finally {
      setSavingOt(false);
    }
  };

  const saveR3Pick = async () => {
    if (!user) return;
    setSavingR3(true);
    try {
      const val = Math.max(1, parseInt(r3Input) || 1);
      const pick = { uid: user.uid, groupId: group.id, season: String(currentNBASeason()), pointDiff: val, submittedAt: Date.now() };
      const existing = await getDocs(query(collection(db, 'playoff_r3_bonus_picks'), where('uid', '==', user.uid), where('groupId', '==', group.id)));
      if (!existing.empty) {
        await updateDoc(doc(db, 'playoff_r3_bonus_picks', existing.docs[0].id), pick);
      } else {
        await addDoc(collection(db, 'playoff_r3_bonus_picks'), pick);
      }
      const snap = await getDocs(query(collection(db, 'playoff_r3_bonus_picks'), where('groupId', '==', group.id)));
      setR3Picks(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; pointDiff: number; pointsEarned?: number })));
      setShowR3Modal(false);
    } finally {
      setSavingR3(false);
    }
  };

  const scoreR3Bonus = async () => {
    setSavingR3Score(true);
    try {
      const actualDiff = Math.max(1, parseInt(r3ActualInput) || 1);
      const unscored = r3Picks.filter(p => p.pointsEarned === undefined);
      if (unscored.length > 0) {
        const batch = writeBatch(db);
        const deltaByUid = new Map<string, number>();
        for (const pick of unscored) {
          const pts = pick.pointDiff === actualDiff ? 4 : 0;
          batch.update(doc(db, 'playoff_r3_bonus_picks', pick.id), { pointsEarned: pts });
          if (pts > 0) deltaByUid.set(pick.uid, (deltaByUid.get(pick.uid) ?? 0) + pts);
        }
        if (deltaByUid.size > 0) {
          const updatedMems = group.members.map(m => ({
            ...m,
            totalPoints: (m.totalPoints ?? 0) + (deltaByUid.get(m.uid) ?? 0),
          }));
          batch.update(doc(db, 'groups', group.id), { members: updatedMems });
        }
        await batch.commit();
        const snap = await getDocs(query(collection(db, 'playoff_r3_bonus_picks'), where('groupId', '==', group.id)));
        setR3Picks(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; uid: string; pointDiff: number; pointsEarned?: number })));
      }
      setShowR3ScoreModal(false);
    } finally {
      setSavingR3Score(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Scoring info ── */}
      <View style={styles.scoringInfo}>
        <Text style={styles.scoringInfoText}>📊 Round 1: Winner = 1 pt · Winner + games = 3 pts</Text>
        <Text style={styles.scoringInfoText}>📊 Round 2: Winner = 1.5 pts · Winner + games = 4.5 pts</Text>
        <Text style={styles.scoringInfoText}>📊 Conf Finals: Winner = 2.5 pts · Winner + games = 6 pts</Text>
        <Text style={styles.scoringInfoText}>📊 Finals: Winner = 3.5 pts · Winner + games = 9 pts</Text>
      </View>

      {/* ── Championship Pick Section ── */}
      {(() => {
        const champion =allSeries.length > 0 && allSeries.every(s => s.isComplete)
          ? allSeries.find(s => s.round === 'first_round' && false)?.winner // placeholder — real champ is last series winner
          ?? (() => { const last = [...allSeries].sort((a,b) => (b.games.at(-1)?.date ?? '').localeCompare(a.games.at(-1)?.date ?? ''))[0]; return last?.winner; })()
          : null;
        const myChampPick = champPicks.find(p => p.uid === user?.uid);
        return (
          <View style={styles.bonusSection}>
            <View style={styles.bonusHeader}>
              <Text style={styles.bonusTitleText}>🏆 Pick the Champion</Text>
              <Text style={styles.bonusSubText}>
                {playoffsStarted ? 'Locked — playoffs in progress' : 'Locks when Round 1 tips off'}
              </Text>
            </View>

            {/* All members' picks */}
            {playoffsStarted && champPicks.length > 0 && (
              <View style={styles.bonusTable}>
                {group.members.map(member => {
                  const pick = champPicks.find(p => p.uid === member.uid);
                  const correct = champion && pick && pick.teamId === champion.id;
                  return (
                    <View key={member.uid} style={styles.bonusTableRow}>
                      <Text style={[styles.bonusCol, { flex: 2, color: '#d1d5db' }]}>{member.displayName}</Text>
                      <Text style={[styles.bonusCol, { flex: 2, color: pick ? '#f97316' : '#4b5563' }]}>
                        {pick ? pick.teamAbbr : '–'}
                      </Text>
                      {champion && pick && (
                        <Text style={[styles.bonusCol, { color: correct ? '#22c55e' : '#ef4444' }]}>
                          {pick.pointsEarned !== undefined
                            ? `+${pick.pointsEarned} pts`
                            : correct ? `+${CHAMP_POINTS[pick.teamAbbr] ?? 5} pts` : '+0 pts'}
                        </Text>
                      )}
                      {champion && !pick && (
                        <Text style={[styles.bonusCol, { color: '#4b5563' }]}>–</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {!playoffsStarted && (
              <TouchableOpacity style={styles.bonusBtn} onPress={() => setShowChampModal(true)}>
                <Text style={styles.bonusBtnText}>{myChampPick ? `My pick: ${myChampPick.teamAbbr} · Change` : 'Pick champion'}</Text>
              </TouchableOpacity>
            )}
            {playoffsStarted && myChampPick && (
              <Text style={[styles.bonusSubText, { paddingHorizontal: 16, paddingBottom: 12 }]}>
                Your pick: <Text style={{ color: '#f97316', fontWeight: '700' }}>{myChampPick.teamAbbr}</Text>
              </Text>
            )}
          </View>
        );
      })()}

      {/* ── Championship Modal ── */}
      <Modal visible={showChampModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🏆 Pick the Champion</Text>
            <Text style={styles.modalSubtitle}>Locks when Round 1 starts</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {[...new Map(allSeries.flatMap(s => [s.homeTeam, s.awayTeam]).map(t => [t.id, t])).values()]
                .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
                .map(team => (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.champTeamBtn, savingChamp && { opacity: 0.5 }]}
                    onPress={() => saveChamp(team.id, team.abbreviation)}
                    disabled={savingChamp}
                  >
                    <Text style={styles.champTeamAbbr}>{team.abbreviation}</Text>
                    <Text style={styles.champTeamCity}>{team.city}</Text>
                    <Text style={styles.champTeamArrow}>›</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1e2d3d', marginTop: 8 }]} onPress={() => setShowChampModal(false)}>
              <Text style={{ color: '#9ca3af', fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* ── Round 2 OT Modal ── */}
      <Modal visible={showOtModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>⏱️ Round 2 OT Games</Text>
            <Text style={styles.modalSubtitle}>How many games in Round 2 will go to overtime?</Text>
            <Text style={[styles.modalSubtitle, { marginTop: 4 }]}>Exact answer = 4 pts · Locks when Round 2 tips off</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 24 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setOtInput(v => String(Math.max(0, parseInt(v) - 1)))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', minWidth: 52, textAlign: 'center' }}>{otInput}</Text>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setOtInput(v => String(parseInt(v) + 1))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#8b5cf6' }, savingOt && { opacity: 0.5 }]}
              onPress={saveOtPick}
              disabled={savingOt}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{savingOt ? 'Saving...' : 'Lock In Pick'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1e2d3d', marginTop: 8 }]} onPress={() => setShowOtModal(false)}>
              <Text style={{ color: '#9ca3af', fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Round 3 Pick Modal ── */}
      <Modal visible={showR3Modal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📏 Biggest Point Diff</Text>
            <Text style={styles.modalSubtitle}>What will be the biggest point difference in a single Conf Finals game?</Text>
            <Text style={[styles.modalSubtitle, { marginTop: 4 }]}>Exact answer = 4 pts · Locks when Conf Finals tips off</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 24 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setR3Input(v => String(Math.max(1, parseInt(v) - 1)))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', minWidth: 64, textAlign: 'center' }}>{r3Input}</Text>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setR3Input(v => String(parseInt(v) + 1))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#8b5cf6' }, savingR3 && { opacity: 0.5 }]}
              onPress={saveR3Pick}
              disabled={savingR3}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{savingR3 ? 'Saving...' : 'Lock In Pick'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1e2d3d', marginTop: 8 }]} onPress={() => setShowR3Modal(false)}>
              <Text style={{ color: '#9ca3af', fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Round 3 Admin Score Modal ── */}
      <Modal visible={showR3ScoreModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📏 Enter Actual Result</Text>
            <Text style={styles.modalSubtitle}>What was the biggest point difference in a Conf Finals game?</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 24 }}>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setR3ActualInput(v => String(Math.max(1, parseInt(v) - 1)))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', minWidth: 64, textAlign: 'center' }}>{r3ActualInput}</Text>
              <TouchableOpacity
                style={{ backgroundColor: '#1e2d3d', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setR3ActualInput(v => String(parseInt(v) + 1))}
              >
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 }}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#1e40af' }, savingR3Score && { opacity: 0.5 }]}
              onPress={scoreR3Bonus}
              disabled={savingR3Score}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{savingR3Score ? 'Scoring...' : 'Score Everyone'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#1e2d3d', marginTop: 8 }]} onPress={() => setShowR3ScoreModal(false)}>
              <Text style={{ color: '#9ca3af', fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {[...rounds].reverse().map((roundSeries, displayIndex) => {
        const roundIndex = rounds.length - 1 - displayIndex;
        const label = ROUND_LABELS[roundIndex] ?? `Round ${roundIndex + 1}`;

        // Round is locked the moment ANY game in it is no longer scheduled
        const roundStarted = roundSeries.some(s =>
          s.games.some(g => g.status !== 'scheduled')
        );
        const roundComplete = roundSeries.every(s => s.isComplete);

        // Who has submitted picks for this round (at least one series)
        const submittedUids = [...new Set(
          allPredictions
            .filter(p => roundSeries.some(s => s.id === p.seriesId))
            .map(p => p.uid)
        )];

        return (
          <View key={roundIndex}>
            {/* Round header */}
            <View style={styles.roundHeader}>
              <Text style={styles.roundLabel}>
                🏆 {label}
                {roundComplete ? '  ✓ Complete' : roundStarted ? '  🔴 Live' : '  🔒 Open for picks'}
              </Text>
            </View>

            {/* Before round starts: show who submitted */}
            {!roundStarted && (
              <View style={styles.deadlineBanner}>
                <Text style={styles.deadlineBannerText}>
                  Picks lock when {label} tips off · {submittedUids.length}/{group.members.length} submitted
                </Text>
                <View style={styles.submittedDots}>
                  {group.members.map(m => (
                    <View
                      key={m.uid}
                      style={[styles.dot, submittedUids.includes(m.uid) ? styles.dotDone : styles.dotEmpty]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Round 2 OT bonus card — sits at top of Round 2 section */}
            {roundIndex === 1 && (() => {
              const r2Started = roundStarted;
              const r2Complete = roundComplete;
              const actualOt = r2Complete
                ? roundSeries.flatMap(s => s.games).filter(g => g.status === 'final' && g.isOT).length
                : null;
              const myOtPick = otPicks.find(p => p.uid === user?.uid);
              return (
                <View style={styles.bonusSection}>
                  <View style={styles.bonusHeader}>
                    <Text style={styles.bonusTitleText}>⏱️ Round 2 — OT Games</Text>
                    <Text style={styles.bonusSubText}>
                      {r2Complete
                        ? `Round 2 finished — ${actualOt} OT game${actualOt !== 1 ? 's' : ''}`
                        : r2Started
                          ? 'Locked — Round 2 in progress'
                          : 'How many games go to overtime? · 4 pts exact · Locks when Round 2 tips off'}
                    </Text>
                  </View>
                  {r2Started && otPicks.length > 0 && (
                    <View style={styles.bonusTable}>
                      {group.members.map(member => {
                        const pick = otPicks.find(p => p.uid === member.uid);
                        const correct = r2Complete && pick != null && pick.otGames === actualOt;
                        return (
                          <View key={member.uid} style={styles.bonusTableRow}>
                            <Text style={[styles.bonusCol, { flex: 2, color: '#d1d5db', textAlign: 'left' }]}>{member.displayName}</Text>
                            <Text style={[styles.bonusCol, { flex: 2, color: pick != null ? '#f97316' : '#4b5563' }]}>
                              {pick != null ? `${pick.otGames} OT` : '–'}
                            </Text>
                            {r2Complete && (
                              <Text style={[styles.bonusCol, { color: correct ? '#22c55e' : '#ef4444' }]}>
                                {pick != null ? (correct ? '+4 pts' : '+0 pts') : '–'}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {!r2Started && (
                    <TouchableOpacity
                      style={styles.bonusBtn}
                      onPress={() => { setOtInput(myOtPick != null ? String(myOtPick.otGames) : '0'); setShowOtModal(true); }}
                    >
                      <Text style={styles.bonusBtnText}>
                        {myOtPick != null ? `My pick: ${myOtPick.otGames} OT games · Change` : 'Make your pick'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {r2Started && myOtPick != null && !r2Complete && (
                    <Text style={[styles.bonusSubText, { paddingHorizontal: 0, paddingBottom: 4 }]}>
                      Your pick: <Text style={{ color: '#f97316', fontWeight: '700' }}>{myOtPick.otGames} OT games</Text>
                    </Text>
                  )}
                </View>
              );
            })()}

            {/* Round 3 point-diff bonus card */}
            {roundIndex === 2 && (() => {
              const r3Started = roundStarted;
              const r3Complete = roundComplete;
              const myR3Pick = r3Picks.find(p => p.uid === user?.uid);
              const isAdmin = user?.uid === group.adminUid;
              const allScored = r3Picks.length > 0 && r3Picks.every(p => p.pointsEarned !== undefined);
              return (
                <View style={styles.bonusSection}>
                  <View style={styles.bonusHeader}>
                    <Text style={styles.bonusTitleText}>📏 Conf Finals — Biggest Point Diff</Text>
                    <Text style={styles.bonusSubText}>
                      {r3Started
                        ? 'Locked — Conf Finals in progress'
                        : 'What will be the biggest point difference in a single game? · 4 pts exact · Locks when Conf Finals tips off'}
                    </Text>
                  </View>

                  {r3Started && r3Picks.length > 0 && (
                    <View style={styles.bonusTable}>
                      {group.members.map(member => {
                        const pick = r3Picks.find(p => p.uid === member.uid);
                        const correct = allScored && pick != null && pick.pointsEarned! > 0;
                        return (
                          <View key={member.uid} style={styles.bonusTableRow}>
                            <Text style={[styles.bonusCol, { flex: 2, color: '#d1d5db', textAlign: 'left' }]}>{member.displayName}</Text>
                            <Text style={[styles.bonusCol, { flex: 2, color: pick != null ? '#f97316' : '#4b5563' }]}>
                              {pick != null ? `${pick.pointDiff} pts` : '–'}
                            </Text>
                            {allScored && (
                              <Text style={[styles.bonusCol, { color: correct ? '#22c55e' : '#ef4444' }]}>
                                {pick != null ? (correct ? '+4 pts' : '+0 pts') : '–'}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {!r3Started && (
                    <TouchableOpacity
                      style={styles.bonusBtn}
                      onPress={() => { setR3Input(myR3Pick != null ? String(myR3Pick.pointDiff) : '1'); setShowR3Modal(true); }}
                    >
                      <Text style={styles.bonusBtnText}>
                        {myR3Pick != null ? `My pick: ${myR3Pick.pointDiff} pts · Change` : 'Make your pick'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {r3Started && myR3Pick != null && !allScored && (
                    <Text style={[styles.bonusSubText, { paddingHorizontal: 0, paddingBottom: 4 }]}>
                      Your pick: <Text style={{ color: '#f97316', fontWeight: '700' }}>{myR3Pick.pointDiff} pts</Text>
                    </Text>
                  )}
                  {isAdmin && r3Started && r3Complete && !allScored && (
                    <TouchableOpacity
                      style={[styles.bonusBtn, { backgroundColor: '#1e40af', marginTop: 8 }]}
                      onPress={() => setShowR3ScoreModal(true)}
                    >
                      <Text style={styles.bonusBtnText}>Admin: Enter actual result</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            {/* Series cards */}
            {roundSeries.map(s => {
              const myPick = myPredictions.find(p => p.seriesId === s.id);
              const seriesPicks = allPredictions.filter(p => p.seriesId === s.id);

              return (
                <View key={s.id} style={styles.gameBlock}>
                  <View style={styles.gameHeader}>
                    <View style={styles.gameTeams}>
                      <Text style={styles.gameMatchup}>
                        {s.awayTeam.abbreviation} vs {s.homeTeam.abbreviation}
                      </Text>
                      <Text style={styles.seriesRecord}>
                        {s.isComplete
                          ? `${s.winner?.abbreviation} wins in ${s.totalGames}`
                          : roundStarted
                            ? `${s.awayWins}–${s.homeWins}`
                            : 'Series not started'}
                      </Text>
                    </View>

                    {/* Pick button only shown before round starts */}
                    {!roundStarted ? (
                      <TouchableOpacity
                        style={[styles.pickBtn, myPick && styles.pickBtnDone]}
                        onPress={() => setSelectedSeries(s)}
                      >
                        <Text style={styles.pickBtnText}>
                          {myPick
                            ? (myPick.predictedWinnerTeamId === s.homeTeam.id
                                ? s.homeTeam.abbreviation
                                : s.awayTeam.abbreviation) + ` in ${myPick.predictedGames} ✓`
                            : 'Pick'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.deadlinePassed}>
                        {seriesPicks.length}/{group.members.length} picked
                      </Text>
                    )}
                  </View>

                  {/* Reveal all picks once round has started */}
                  {roundStarted && (
                    <View style={styles.revealTable}>
                      {group.members.map(member => {
                        const pick = seriesPicks.find(p => p.uid === member.uid);
                        if (!pick) return (
                          <View key={member.uid} style={styles.revealRow}>
                            <Text style={styles.revealName}>{member.displayName}</Text>
                            <Text style={styles.revealNoPick}>No pick</Text>
                          </View>
                        );
                        const pickedAbbr = pick.predictedWinnerTeamId === s.homeTeam.id
                          ? s.homeTeam.abbreviation : s.awayTeam.abbreviation;
                        const correct = s.isComplete && s.winner?.id === pick.predictedWinnerTeamId;
                        const lengthCorrect = s.isComplete && s.totalGames === pick.predictedGames;
                        const pts = s.isComplete ? calcSeriesPoints(roundIndex, correct, lengthCorrect) : undefined;
                        return (
                          <View key={member.uid} style={styles.revealRow}>
                            <Text style={styles.revealName}>{member.displayName}</Text>
                            <View style={[styles.revealPick,
                              s.isComplete
                                ? (correct ? styles.revealCorrect : styles.revealWrong)
                                : styles.revealLive]}>
                              <Text style={styles.revealPickText}>
                                {pickedAbbr} in {pick.predictedGames}
                              </Text>
                            </View>
                            {pts !== undefined
                              ? <Text style={styles.revealPts}>+{pts} pts</Text>
                              : s.isComplete ? <Text style={styles.revealPts}>+0 pts</Text>
                              : <Text style={styles.revealPending}>–</Text>}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      {selectedSeries && (
        <PredictSeriesModal
          series={selectedSeries}
          groupId={group.id}
          roundIndex={rounds.findIndex(r => r.some(s => s.id === selectedSeries.id))}
          onClose={() => setSelectedSeries(null)}
          onSaved={async () => {
            setSelectedSeries(null);
            // Reload predictions so picks show immediately without refresh
            const snap = await getDocs(query(
              collection(db, 'series_predictions'),
              where('groupId', '==', group.id)
            ));
            setAllPredictions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SeriesPrediction)));
          }}
        />
      )}
    </ScrollView>
  );
}

// ── Football: predict matches from followed leagues ───────────────────────

// Which leagues this group follows — from group doc, fallback to all
const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map(l => l.id);;

function calcFootballPoints(pred: FootballPrediction, game: FootballGame): number {
  if (game.homeScore === null || game.awayScore === null) return 0;
  const actual: FootballResult =
    game.homeScore > game.awayScore ? 'home' :
    game.awayScore > game.homeScore ? 'away' : 'draw';
  let pts = 0;
  if (pred.predictedResult === actual) pts += 2;
  if (pred.predictedHomeScore !== undefined && pred.predictedAwayScore !== undefined) {
    if (pred.predictedHomeScore === game.homeScore && pred.predictedAwayScore === game.awayScore) {
      pts += 3;
    }
  }
  return pts;
}

function FootballPredictions({ group }: { group: Group }) {
  const { user } = useAuthContext();
  const groupLeagueIds = group.leagueIds ?? ALL_LEAGUE_IDS;
  const [games, setGames] = useState<FootballGame[]>([]);
  const [allPredictions, setAllPredictions] = useState<FootballPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<FootballGame | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        // Load 1 day back + 7 days forward in parallel (all cached after first load)
        const localIso = (n: number) => {
          const d = new Date();
          d.setDate(d.getDate() + n);
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${mo}-${day}`;
        };
        const days = Array.from({ length: 4 }, (_, i) => localIso(i - 1)); // -1 to +2
        const results = await Promise.allSettled(
          days.map(date => getFootballGamesByDate(date, groupLeagueIds))
        );
        const allGames: FootballGame[] = results
          .filter((r): r is PromiseFulfilledResult<FootballGame[]> => r.status === 'fulfilled')
          .flatMap(r => r.value);
        setGames(allGames);

        const snap = await getDocs(query(
          collection(db, 'football_predictions'),
          where('groupId', '==', group.id)
        ));
        const preds = snap.docs.map(d => ({ id: d.id, ...d.data() } as FootballPrediction));

        // Auto-score finished games
        const finalGames = allGames.filter(g => g.status === 'final');
        const unscoredPreds = preds.filter(p =>
          p.pointsEarned === undefined && finalGames.some(g => g.id === p.fixtureId)
        );
        if (unscoredPreds.length > 0) {
          const batch = writeBatch(db);
          const newScores = new Map<string, number>();
          for (const pred of unscoredPreds) {
            const game = finalGames.find(g => g.id === pred.fixtureId)!;
            newScores.set(pred.id!, calcFootballPoints(pred, game));
          }
          // Only accumulate points from newly scored predictions (delta), not all preds
          const totalByUid = new Map<string, number>();
          for (const [predId, pts] of newScores) {
            const pred = unscoredPreds.find(p => p.id === predId);
            if (pred) totalByUid.set(pred.uid, (totalByUid.get(pred.uid) ?? 0) + pts);
          }
          for (const [predId, pts] of newScores) {
            batch.update(doc(db, 'football_predictions', predId), { pointsEarned: pts });
          }
          const updatedMembers = group.members.map(m => ({
            ...m,
            totalPoints: (m.totalPoints ?? 0) + (totalByUid.get(m.uid) ?? 0),
          }));
          batch.update(doc(db, 'groups', group.id), { members: updatedMembers });
          await batch.commit();

          const rescored = await getDocs(query(
            collection(db, 'football_predictions'),
            where('groupId', '==', group.id)
          ));
          setAllPredictions(rescored.docs.map(d => ({ id: d.id, ...d.data() } as FootballPrediction)));
        } else {
          setAllPredictions(preds);
        }
      } catch (e: any) {
        console.error('[FootballPredictions] error:', e);
        setError(e?.message?.includes('429')
          ? 'Too many requests — please wait a moment.'
          : 'Failed to load football fixtures.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [group.id, user?.uid, refreshKey]);

  if (loading) return <ActivityIndicator color="#f97316" style={styles.loader} />;
  if (error) return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>⚠️ {error}</Text>
      <TouchableOpacity
        style={{ marginTop: 16, backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
        onPress={() => { setLoading(true); setRefreshKey(k => k + 1); }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const myPredictions = allPredictions.filter(p => p.uid === user?.uid);
  const upcomingGames = games.filter(g => g.status === 'scheduled');
  const liveGames = games.filter(g => g.status === 'live');
  const finalGames = games.filter(g => g.status === 'final');

  // Group by league for display
  const leagueGroups = SUPPORTED_LEAGUES
    .filter(l => groupLeagueIds.includes(l.id))
    .map(l => ({
      league: l,
      upcoming: upcomingGames.filter(g => g.leagueId === l.id),
      live: liveGames.filter(g => g.leagueId === l.id),
      final: finalGames.filter(g => g.leagueId === l.id),
    }))
    .filter(g => g.upcoming.length > 0 || g.live.length > 0 || g.final.length > 0);

  const FootballRevealTable = ({ game }: { game: FootballGame }) => {
    const lockedPicks = allPredictions.filter(p => p.fixtureId === game.id);
    const actual: FootballResult | null = game.homeScore !== null && game.awayScore !== null
      ? game.homeScore > game.awayScore ? 'home' : game.awayScore > game.homeScore ? 'away' : 'draw'
      : null;
    return (
      <View style={styles.gameBlock}>
        <View style={styles.gameHeader}>
          <View style={styles.gameTeams}>
            <Text style={styles.footballLeague}>{game.leagueName}</Text>
            <Text style={styles.gameMatchup}>{game.homeTeam.name} vs {game.awayTeam.name}</Text>
            {game.status === 'live' && (
              <Text style={styles.gameLive}>● LIVE {game.elapsed ? `${game.elapsed}'` : ''}  {game.homeScore}–{game.awayScore}</Text>
            )}
            {game.status === 'final' && (
              <Text style={styles.gameFinal}>FT  {game.homeScore}–{game.awayScore}</Text>
            )}
          </View>
          <Text style={styles.deadlinePassed}>{lockedPicks.length}/{group.members.length} picked</Text>
        </View>
        <View style={styles.revealTable}>
          {group.members.map(member => {
            const pick = lockedPicks.find(p => p.uid === member.uid);
            if (!pick) return (
              <View key={member.uid} style={styles.revealRow}>
                <Text style={styles.revealName}>{member.displayName}</Text>
                <Text style={styles.revealNoPick}>No pick</Text>
              </View>
            );
            const label = pick.predictedResult === 'home'
              ? game.homeTeam.shortName
              : pick.predictedResult === 'away'
                ? game.awayTeam.shortName
                : 'Draw';
            const correct = actual !== null && pick.predictedResult === actual;
            const wrong = actual !== null && pick.predictedResult !== actual;
            return (
              <View key={member.uid} style={styles.revealRow}>
                <Text style={styles.revealName}>{member.displayName}</Text>
                <View style={[styles.revealPick,
                  correct ? styles.revealCorrect : wrong ? styles.revealWrong : styles.revealLive]}>
                  <Text style={styles.revealPickText}>{label}</Text>
                  {pick.predictedHomeScore !== undefined && (
                    <Text style={styles.revealScore}>{pick.predictedHomeScore}–{pick.predictedAwayScore}</Text>
                  )}
                </View>
                {pick.pointsEarned !== undefined
                  ? <Text style={styles.revealPts}>+{pick.pointsEarned} pts</Text>
                  : <Text style={styles.revealPending}>–</Text>}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (leagueGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>⚽ No fixtures available right now.</Text>
        <Text style={styles.emptySubtext}>Check back soon for upcoming matches.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

      {/* ── Scoring info ── */}
      <View style={styles.scoringInfo}>
        <Text style={styles.scoringInfoText}>📊 Scoring: Correct result = 2 pts · Exact score = +3 pts</Text>
      </View>

      {leagueGroups.map(({ league, upcoming, live, final: finished }) => (
        <View key={league.id}>
          {/* League header */}
          <View style={styles.footballLeagueHeader}>
            <Text style={styles.footballLeagueEmoji}>{league.logo}</Text>
            <Text style={styles.footballLeagueName}>{league.name}</Text>
          </View>

          {/* Live games */}
          {live.map(game => (
            <View key={game.id}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeader, { color: '#ef4444', fontSize: 12 }]}>🔴 LIVE</Text>
              </View>
              <FootballRevealTable game={game} />
            </View>
          ))}

          {/* Upcoming — make picks */}
          {upcoming.map(game => {
            const myPick = myPredictions.find(p => p.fixtureId === game.id);
            const submittedCount = allPredictions.filter(p => p.fixtureId === game.id).length;
            return (
              <View key={game.id} style={styles.gameBlock}>
                <View style={styles.gameHeader}>
                  <View style={styles.gameTeams}>
                    <Text style={styles.gameMatchup}>{game.homeTeam.name} vs {game.awayTeam.name}</Text>
                    <Text style={styles.gameTime}>{game.date}  ·  {game.time}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <TouchableOpacity
                      style={[styles.pickBtn, myPick && styles.pickBtnDone]}
                      onPress={() => setSelectedGame(game)}
                    >
                      <Text style={styles.pickBtnText}>
                        {myPick
                          ? (myPick.predictedResult === 'home'
                              ? game.homeTeam.shortName
                              : myPick.predictedResult === 'away'
                                ? game.awayTeam.shortName
                                : 'Draw') + ' ✓'
                          : 'Pick'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.deadlinePassed}>{submittedCount}/{group.members.length}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Finished — reveal picks */}
          {finished.map(game => <FootballRevealTable key={game.id} game={game} />)}
        </View>
      ))}

      {selectedGame && (
        <PredictFootballModal
          game={selectedGame}
          groupId={group.id}
          onClose={() => setSelectedGame(null)}
          onSaved={() => { setSelectedGame(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </ScrollView>
  );
}

// ── Football predict modal ────────────────────────────────────────────────

function PredictFootballModal({
  game,
  groupId,
  onClose,
  onSaved,
}: {
  game: FootballGame;
  groupId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuthContext();
  const [result, setResult] = useState<FootballResult | null>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !result) return;
    setSaving(true);
    try {
      const prediction: any = {
        uid: user.uid,
        groupId,
        fixtureId: game.id,
        leagueId: game.leagueId,
        predictedResult: result,
        submittedAt: Date.now(),
      };
      if (homeScore) prediction.predictedHomeScore = parseInt(homeScore);
      if (awayScore) prediction.predictedAwayScore = parseInt(awayScore);

      const q = query(
        collection(db, 'football_predictions'),
        where('uid', '==', user.uid),
        where('groupId', '==', groupId),
        where('fixtureId', '==', game.id)
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        await updateDoc(doc(db, 'football_predictions', existing.docs[0].id), prediction);
      } else {
        await addDoc(collection(db, 'football_predictions'), prediction);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      console.error('[PredictFootballModal]', e);
    } finally {
      setSaving(false);
    }
  };

  const RESULTS: { value: FootballResult; label: string }[] = [
    { value: 'home', label: game.homeTeam.name },
    { value: 'draw', label: 'Draw' },
    { value: 'away', label: game.awayTeam.name },
  ];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Predict this match</Text>
          <Text style={styles.sheetSubtitle}>{game.homeTeam.name} vs {game.awayTeam.name}</Text>
          <Text style={styles.sheetLeague}>{game.leagueName}  ·  {game.date} {game.time}</Text>

          <Text style={styles.pickLabel}>Result</Text>
          <View style={styles.resultRow}>
            {RESULTS.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[styles.resultBtn, result === r.value && styles.resultBtnSelected]}
                onPress={() => setResult(r.value)}
              >
                <Text style={[styles.resultBtnText, result === r.value && styles.resultBtnTextSelected]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.pickLabel}>Score (optional +5 pts for exact)</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreInput}>
              <Text style={styles.scoreLabel}>{game.homeTeam.shortName}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="–"
                placeholderTextColor="#6b7280"
                value={homeScore}
                onChangeText={setHomeScore}
                maxLength={2}
              />
            </View>
            <Text style={styles.scoreDash}>–</Text>
            <View style={styles.scoreInput}>
              <Text style={styles.scoreLabel}>{game.awayTeam.shortName}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="–"
                placeholderTextColor="#6b7280"
                value={awayScore}
                onChangeText={setAwayScore}
                maxLength={2}
              />
            </View>
          </View>

          <View style={styles.pointsGuide}>
            <Text style={styles.pointsTitle}>Points you can earn:</Text>
            <Text style={styles.pointsRow}>✓ Correct result (W/D/L) → 2 pts</Text>
            <Text style={styles.pointsRow}>✓ Exact score → +3 pts</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!result || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!result || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Lock In Prediction'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loader: { margin: 32 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptySubtext: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  hint: { color: '#6b7280', fontSize: 12, textAlign: 'center', padding: 10, paddingBottom: 4 },
  sectionHeader: { color: '#fff', fontSize: 14, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  liveRefresh: { color: '#6b7280', fontSize: 11 },

  roundHeader: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4,
  },
  roundLabel: {
    color: '#f97316', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  deadlineBanner: {
    backgroundColor: '#1a2634', margin: 12, borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#f97316',
  },
  deadlineBannerText: { color: '#9ca3af', fontSize: 13, marginBottom: 8 },

  gameBlock: {
    backgroundColor: '#1a2634', marginHorizontal: 12, marginVertical: 5,
    borderRadius: 12, overflow: 'hidden',
  },
  gameHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: 14,
  },
  gameTeams: { flex: 1 },
  gameMatchup: { fontSize: 16, fontWeight: '800', color: '#fff' },
  gameTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  gameLive: { fontSize: 12, color: '#ef4444', fontWeight: '700', marginTop: 2 },
  gameFinal: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  seriesRecord: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  pickBtn: {
    backgroundColor: '#f97316', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, minWidth: 64, alignItems: 'center',
  },
  pickBtnDone: { backgroundColor: '#166534' },
  pickBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deadlinePassed: { color: '#6b7280', fontSize: 12 },

  submittedRow: { paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  submittedText: { color: '#6b7280', fontSize: 12 },
  submittedDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotDone: { backgroundColor: '#f97316' },
  dotEmpty: { backgroundColor: '#374151' },

  revealTable: { borderTopWidth: 1, borderTopColor: '#0f1923' },
  revealRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#0f1923',
    gap: 10,
  },
  revealName: { flex: 1, color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  revealNoPick: { color: '#4b5563', fontSize: 12 },
  revealPick: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  revealPickText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  revealScore: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  revealCorrect: { backgroundColor: '#14532d' },
  revealWrong: { backgroundColor: '#450a0a' },
  revealLive: { backgroundColor: '#1e3a5f' },
  revealPts: { color: '#f97316', fontWeight: '800', fontSize: 14, minWidth: 50, textAlign: 'right' },
  revealPending: { color: '#6b7280', fontSize: 14, minWidth: 50, textAlign: 'right' },

  // Football league grouping
  footballLeagueHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  footballLeagueEmoji: { fontSize: 18 },
  footballLeagueName: { fontSize: 13, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  footballLeague: { fontSize: 11, color: '#f97316', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },

  // Bonus picks
  bonusSection: { margin: 12, backgroundColor: '#1a2634', borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#8b5cf6' },
  bonusHeader: { marginBottom: 10 },
  bonusTitleText: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 },
  bonusSubText: { fontSize: 12, color: '#6b7280' },
  bonusTable: { marginBottom: 10 },
  bonusTableHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#374151' },
  bonusTableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  bonusActualRow: { flexDirection: 'row', paddingVertical: 6, marginTop: 2 },
  bonusCol: { flex: 1, fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  bonusBtn: { backgroundColor: '#8b5cf6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  bonusBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bonusQuestion: { color: '#d1d5db', fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  bonusInput: { backgroundColor: '#0f1923', color: '#fff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, borderWidth: 1, borderColor: '#374151' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1a2634', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  sheetSubtitle: { fontSize: 15, color: '#e5e7eb', marginBottom: 2 },
  sheetLeague: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  pickLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  resultBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#0f1923', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  resultBtnSelected: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  resultBtnText: { fontSize: 13, fontWeight: '700', color: '#9ca3af', textAlign: 'center' },
  resultBtnTextSelected: { color: '#f97316' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  scoreInput: { flex: 1, alignItems: 'center' },
  scoreLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  scoreDash: { color: '#6b7280', fontSize: 24, fontWeight: '300' },
  input: { backgroundColor: '#0f1923', color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center', borderRadius: 8, padding: 12, width: '100%' },
  pointsGuide: { backgroundColor: '#0f1923', borderRadius: 10, padding: 14, marginBottom: 20 },
  pointsTitle: { color: '#9ca3af', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  pointsRow: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  saveBtn: { backgroundColor: '#f97316', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelBtnText: { color: '#6b7280', fontSize: 15 },

  // Bonus modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#1a2634', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 },
  modalSubtitle: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  modalBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  champTeamBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  champTeamAbbr: { fontSize: 15, fontWeight: '800', color: '#f97316', width: 48 },
  champTeamCity: { flex: 1, fontSize: 14, color: '#d1d5db' },
  champTeamArrow: { fontSize: 20, color: '#4b5563' },
  scoringInfo: { marginHorizontal: 12, marginBottom: 8, marginTop: 4, backgroundColor: '#1a2634', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#1e2d3d' },
  scoringInfoText: { color: '#6b7280', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
