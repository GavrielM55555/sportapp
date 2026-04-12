import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Game } from '../types';

interface Props {
  game: Game;
  onPredict?: () => void;
  myPrediction?: { predictedWinnerTeamId: number };
}

function formatGameTime(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return raw;
  }
}

export function GameCard({ game, onPredict, myPrediction }: Props) {
  const isLive = game.status === 'live';
  const isFinal = game.status === 'final';

  const winnerTeamId =
    isFinal && game.homeScore !== null && game.awayScore !== null
      ? game.homeScore > game.awayScore
        ? game.homeTeam.id
        : game.awayTeam.id
      : null;

  return (
    <View style={styles.card}>
      {/* Status + Date row */}
      <View style={styles.statusRow}>
        {isLive && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>● LIVE {game.period ? `Q${game.period}` : ''} {game.time}</Text>
          </View>
        )}
        {isFinal && <Text style={styles.finalText}>FINAL</Text>}
        {game.status === 'scheduled' && (
          <Text style={styles.scheduledText}>
            {new Date(game.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        )}
        <View style={styles.rightBadges}>
          {game.playoffs && <Text style={styles.playoffBadge}>PLAYOFFS</Text>}
        </View>
      </View>

      {/* Teams & Scores */}
      <View style={styles.teamsRow}>
        {/* Away team */}
        <View style={styles.teamCol}>
          <Text style={[styles.teamAbbr, winnerTeamId === game.awayTeam.id && styles.winner]}>
            {game.awayTeam.abbreviation}
          </Text>
          <Text style={styles.teamName}>{game.awayTeam.city}</Text>
          {myPrediction?.predictedWinnerTeamId === game.awayTeam.id && (
            <Text style={styles.myPick}>★ My pick</Text>
          )}
        </View>

        <View style={styles.scoreCol}>
          {isFinal ? (
            <Text style={styles.score}>{game.awayScore} – {game.homeScore}</Text>
          ) : isLive ? (
            <>
              <Text style={styles.score}>{game.awayScore} – {game.homeScore}</Text>
              {game.period ? <Text style={styles.liveDetail}>Q{game.period} {game.time}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.vs}>VS</Text>
              {game.time ? <Text style={styles.gameTime}>{formatGameTime(game.time)}</Text> : null}
            </>
          )}
        </View>

        {/* Home team */}
        <View style={[styles.teamCol, styles.teamColRight]}>
          <Text style={[styles.teamAbbr, winnerTeamId === game.homeTeam.id && styles.winner]}>
            {game.homeTeam.abbreviation}
          </Text>
          <Text style={styles.teamName}>{game.homeTeam.city}</Text>
          {myPrediction?.predictedWinnerTeamId === game.homeTeam.id && (
            <Text style={styles.myPick}>★ My pick</Text>
          )}
        </View>
      </View>

      {/* Predict button */}
      {game.status === 'scheduled' && onPredict && (
        <TouchableOpacity style={styles.predictBtn} onPress={onPredict}>
          <Text style={styles.predictBtnText}>
            {myPrediction ? 'Update Prediction' : 'Predict'}
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  liveBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  finalText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  scheduledText: { color: '#9ca3af', fontSize: 12 },
  rightBadges: { marginLeft: 'auto', flexDirection: 'row', gap: 6 },
  playoffBadge: { color: '#f97316', fontSize: 11, fontWeight: '700' },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCol: { flex: 1, alignItems: 'flex-start' },
  teamColRight: { alignItems: 'flex-end' },
  teamAbbr: { fontSize: 22, fontWeight: '800', color: '#e5e7eb' },
  winner: { color: '#f97316' },
  teamName: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  myPick: { fontSize: 11, color: '#f97316', marginTop: 2 },
  scoreCol: { alignItems: 'center', flex: 1 },
  score: { fontSize: 24, fontWeight: '800', color: '#fff' },
  vs: { fontSize: 18, color: '#4b5563', fontWeight: '600' },
  liveDetail: { fontSize: 11, color: '#ef4444', marginTop: 2 },
  gameTime: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  predictBtn: {
    marginTop: 12,
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  predictBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
