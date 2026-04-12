import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Game, GamePrediction, GroupMember, PlayoffSeries, SeriesPrediction } from '../types';

// ── Season group: shows predictions per game ─────────────────────────────

interface SeasonTableProps {
  games: Game[];
  members: GroupMember[];
  groupId: string;
}

export function SeasonPredictionsTable({ games, members, groupId }: SeasonTableProps) {
  const [predictions, setPredictions] = useState<GamePrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const gameIds = games.map(g => g.id);
      if (gameIds.length === 0) { setLoading(false); return; }
      const q = query(
        collection(db, 'predictions'),
        where('groupId', '==', groupId),
        where('gameId', 'in', gameIds.slice(0, 10)) // Firestore 'in' limit
      );
      const snap = await getDocs(q);
      setPredictions(snap.docs.map(d => ({ id: d.id, ...d.data() } as GamePrediction)));
      setLoading(false);
    }
    load();
  }, [groupId, games]);

  if (loading) return <ActivityIndicator color="#f97316" style={{ margin: 20 }} />;

  return (
    <ScrollView horizontal>
      <View>
        {/* Header row */}
        <View style={styles.row}>
          <Text style={[styles.cell, styles.nameCell, styles.header]}>Player</Text>
          {games.map(g => (
            <Text key={g.id} style={[styles.cell, styles.gameCell, styles.header]} numberOfLines={2}>
              {g.awayTeam.abbreviation}@{g.homeTeam.abbreviation}
            </Text>
          ))}
          <Text style={[styles.cell, styles.ptsCell, styles.header]}>Pts</Text>
        </View>

        {/* Member rows */}
        {members.map(member => {
          const memberPreds = predictions.filter(p => p.uid === member.uid);
          const totalPts = memberPreds.reduce((s, p) => s + (p.pointsEarned ?? 0), 0);

          return (
            <View key={member.uid} style={styles.row}>
              <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
                {member.displayName}
              </Text>
              {games.map(g => {
                const pred = memberPreds.find(p => p.gameId === g.id);
                const isLocked = g.status === 'live' || g.status === 'final';

                if (!pred) {
                  return <Text key={g.id} style={[styles.cell, styles.gameCell, styles.noPick]}>—</Text>;
                }

                if (!isLocked) {
                  // Before tip-off: show only that they picked, not who
                  return <Text key={g.id} style={[styles.cell, styles.gameCell, styles.locked]}>🔒</Text>;
                }

                // Revealed after tip-off
                const pickedTeam = pred.predictedWinnerTeamId === g.homeTeam.id
                  ? g.homeTeam.abbreviation
                  : g.awayTeam.abbreviation;
                const actualWinner = g.status === 'final' && g.homeScore !== null && g.awayScore !== null
                  ? (g.homeScore > g.awayScore ? g.homeTeam.id : g.awayTeam.id)
                  : null;
                const correct = actualWinner !== null && pred.predictedWinnerTeamId === actualWinner;

                return (
                  <View key={g.id} style={[styles.cell, styles.gameCell, styles.pickCell,
                    g.status === 'final' ? (correct ? styles.correct : styles.wrong) : styles.live]}>
                    <Text style={styles.pickText}>{pickedTeam}</Text>
                    {pred.pointsEarned !== undefined && (
                      <Text style={styles.pickPts}>+{pred.pointsEarned}</Text>
                    )}
                  </View>
                );
              })}
              <Text style={[styles.cell, styles.ptsCell, styles.totalPts]}>{totalPts}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Playoff group: shows series predictions as a table ───────────────────

interface PlayoffTableProps {
  series: PlayoffSeries[];
  members: GroupMember[];
  groupId: string;
}

export function PlayoffPredictionsTable({ series, members, groupId }: PlayoffTableProps) {
  const [predictions, setPredictions] = useState<SeriesPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const q = query(
        collection(db, 'series_predictions'),
        where('groupId', '==', groupId)
      );
      const snap = await getDocs(q);
      setPredictions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SeriesPrediction)));
      setLoading(false);
    }
    load();
  }, [groupId]);

  if (loading) return <ActivityIndicator color="#f97316" style={{ margin: 20 }} />;

  // Round 1 has started if any series has a game played
  const roundStarted = series.some(s => s.games.some(g => g.status !== 'scheduled'));

  return (
    <ScrollView horizontal>
      <View>
        {/* Header */}
        <View style={styles.row}>
          <Text style={[styles.cell, styles.nameCell, styles.header]}>Player</Text>
          {series.map(s => (
            <Text key={s.id} style={[styles.cell, styles.gameCell, styles.header]} numberOfLines={2}>
              {s.awayTeam.abbreviation} v {s.homeTeam.abbreviation}
            </Text>
          ))}
          <Text style={[styles.cell, styles.ptsCell, styles.header]}>Pts</Text>
        </View>

        {/* Rows */}
        {members.map(member => {
          const memberPreds = predictions.filter(p => p.uid === member.uid);
          const totalPts = memberPreds.reduce((s, p) => s + (p.pointsEarned ?? 0), 0);

          return (
            <View key={member.uid} style={styles.row}>
              <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
                {member.displayName}
              </Text>
              {series.map(s => {
                const pred = memberPreds.find(p => p.seriesId === s.id);

                if (!pred) {
                  return <Text key={s.id} style={[styles.cell, styles.gameCell, styles.noPick]}>—</Text>;
                }

                if (!roundStarted) {
                  return <Text key={s.id} style={[styles.cell, styles.gameCell, styles.locked]}>🔒</Text>;
                }

                const pickedTeam = pred.predictedWinnerTeamId === s.homeTeam.id
                  ? s.homeTeam.abbreviation
                  : s.awayTeam.abbreviation;
                const correct = s.isComplete && s.winner?.id === pred.predictedWinnerTeamId;
                const lengthCorrect = s.isComplete && s.totalGames === pred.predictedGames;

                return (
                  <View key={s.id} style={[styles.cell, styles.gameCell, styles.pickCell,
                    s.isComplete ? (correct ? styles.correct : styles.wrong) : styles.live]}>
                    <Text style={styles.pickText}>{pickedTeam} in {pred.predictedGames}</Text>
                    {s.isComplete && (
                      <Text style={styles.pickPts}>
                        +{(correct ? 5 : 0) + (lengthCorrect ? 3 : 0)}
                      </Text>
                    )}
                  </View>
                );
              })}
              <Text style={[styles.cell, styles.ptsCell, styles.totalPts]}>{totalPts}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  cell: { padding: 10, justifyContent: 'center', minHeight: 44 },
  nameCell: { width: 110, borderRightWidth: 1, borderRightColor: '#1e2d3d' },
  gameCell: { width: 90, alignItems: 'center' },
  ptsCell: { width: 50, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#1e2d3d' },
  header: { backgroundColor: '#0f1923', color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  noPick: { color: '#4b5563', textAlign: 'center' },
  locked: { textAlign: 'center', fontSize: 16 },
  pickCell: { borderRadius: 4, margin: 4, padding: 6, alignItems: 'center' },
  pickText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  pickPts: { color: '#f97316', fontSize: 10, marginTop: 2 },
  correct: { backgroundColor: '#14532d' },
  wrong: { backgroundColor: '#450a0a' },
  live: { backgroundColor: '#1e2d3d' },
  totalPts: { color: '#f97316', fontWeight: '800', fontSize: 14, textAlign: 'center' },
});
