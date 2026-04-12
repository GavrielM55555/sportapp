import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PlayoffSeries } from '../types';

interface Props {
  series: PlayoffSeries;
  onPredict?: () => void;
  myPrediction?: { predictedWinnerTeamId: number; predictedGames: number };
}

const ROUND_LABELS: Record<string, string> = {
  first_round: 'First Round',
  conference_semis: 'Conference Semis',
  conference_finals: 'Conference Finals',
  finals: 'NBA Finals',
};

export function SeriesCard({ series, onPredict, myPrediction }: Props) {
  const { homeTeam, awayTeam, homeWins, awayWins, isComplete, winner, totalGames, round } = series;

  return (
    <View style={styles.card}>
      <View style={styles.roundRow}>
        <Text style={styles.round}>{ROUND_LABELS[round] ?? round}</Text>
        {isComplete && <Text style={styles.completedBadge}>COMPLETE</Text>}
      </View>

      <View style={styles.teamsRow}>
        {/* Away team */}
        <View style={styles.teamCol}>
          <Text style={[styles.teamAbbr, isComplete && winner?.id === awayTeam.id && styles.winnerText]}>
            {awayTeam.abbreviation}
          </Text>
          <Text style={styles.teamCity}>{awayTeam.city}</Text>
          {myPrediction?.predictedWinnerTeamId === awayTeam.id && (
            <Text style={styles.myPick}>★ My pick</Text>
          )}
        </View>

        {/* Series record */}
        <View style={styles.recordCol}>
          <Text style={styles.record}>
            {awayWins} – {homeWins}
          </Text>
          {isComplete && totalGames && (
            <Text style={styles.completedIn}>in {totalGames}</Text>
          )}
          {myPrediction && (
            <Text style={styles.myGames}>
              Pred: {myPrediction.predictedGames} games
            </Text>
          )}
        </View>

        {/* Home team */}
        <View style={[styles.teamCol, styles.teamColRight]}>
          <Text style={[styles.teamAbbr, isComplete && winner?.id === homeTeam.id && styles.winnerText]}>
            {homeTeam.abbreviation}
          </Text>
          <Text style={styles.teamCity}>{homeTeam.city}</Text>
          {myPrediction?.predictedWinnerTeamId === homeTeam.id && (
            <Text style={styles.myPick}>★ My pick</Text>
          )}
        </View>
      </View>

      {!isComplete && onPredict && (
        <TouchableOpacity style={styles.predictBtn} onPress={onPredict}>
          <Text style={styles.predictBtnText}>
            {myPrediction ? 'Update Series Pick' : 'Predict Series Outcome'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a2634',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  round: { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  completedBadge: { color: '#22c55e', fontSize: 11, fontWeight: '700' },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  teamCol: { flex: 1, alignItems: 'flex-start' },
  teamColRight: { alignItems: 'flex-end' },
  teamAbbr: { fontSize: 22, fontWeight: '800', color: '#e5e7eb' },
  winnerText: { color: '#f97316' },
  teamCity: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  myPick: { fontSize: 11, color: '#f97316', marginTop: 4 },
  recordCol: { flex: 1, alignItems: 'center' },
  record: { fontSize: 22, fontWeight: '800', color: '#fff' },
  completedIn: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  myGames: { fontSize: 11, color: '#f97316', marginTop: 4 },
  predictBtn: {
    marginTop: 14,
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  predictBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
