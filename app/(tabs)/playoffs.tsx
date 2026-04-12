import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { getPlayoffGames, groupIntoSeries, currentNBASeason } from '../../src/api/balldontlie';
import { getMajorEvents, LeagueEvent } from '../../src/api/apifootball';
import { PlayoffSeries } from '../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function isActive(start: string, end: string): boolean {
  const now = new Date();
  return now >= new Date(start) && now <= new Date(end);
}

// ── NBA Playoff Card ──────────────────────────────────────────────────────
type NbaStatus = 'loading' | 'upcoming' | 'active' | 'done';

function NbaPlayoffCard({ onRefresh }: { onRefresh?: () => void }) {
  const [status, setStatus] = useState<NbaStatus>('loading');
  const [series, setSeries] = useState<PlayoffSeries[]>([]);

  async function load() {
    setStatus('loading');
    try {
      const games = await getPlayoffGames(currentNBASeason());
      const grouped = groupIntoSeries(games);
      setSeries(grouped);
      if (grouped.length === 0) {
        setStatus('upcoming');
      } else if (grouped.every(s => s.isComplete)) {
        setStatus('done');
      } else {
        setStatus('active');
      }
    } catch {
      setStatus('upcoming'); // fallback — assume not started yet
    }
  }

  useEffect(() => { load(); }, []);

  if (status === 'done') return null; // playoffs over, hide the card

  const activeSeries = series.filter(s => !s.isComplete);
  const completedCount = series.filter(s => s.isComplete).length;

  return (
    <View style={[styles.card, { borderColor: '#f97316' }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>🏀</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>NBA Playoffs {currentNBASeason() + 1}</Text>
          {status === 'loading' && <ActivityIndicator color="#f97316" size="small" />}
          {status === 'active' && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>● LIVE</Text>
            </View>
          )}
          {status === 'upcoming' && (
            <Text style={styles.cardSub}>Starting soon · check back daily</Text>
          )}
        </View>
      </View>

      {status === 'active' && activeSeries.length > 0 && (
        <View style={styles.seriesList}>
          {activeSeries.map(s => (
            <View key={s.id} style={styles.seriesRow}>
              <Text style={styles.seriesMatchup}>
                {s.awayTeam.abbreviation} vs {s.homeTeam.abbreviation}
              </Text>
              <Text style={styles.seriesScore}>{s.awayWins}–{s.homeWins}</Text>
            </View>
          ))}
          {completedCount > 0 && (
            <Text style={styles.completedNote}>{completedCount} series completed</Text>
          )}
        </View>
      )}

      {status !== 'loading' && (
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: '#f97316' }]}
          onPress={() => router.push('/(tabs)/groups')}
        >
          <Text style={styles.ctaBtnText}>
            {status === 'active' ? 'Go to My Groups →' : 'Create Playoff Group →'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Football Event Card ───────────────────────────────────────────────────
function FootballEventCard({ event }: { event: LeagueEvent }) {
  const live = isActive(event.start, event.end);
  const days = daysUntil(event.start);

  return (
    <View style={[styles.card, { borderColor: event.accentColor }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{event.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{event.name}</Text>
          {live ? (
            <View style={[styles.liveBadge, { backgroundColor: event.accentColor + '22' }]}>
              <Text style={[styles.liveBadgeText, { color: event.accentColor }]}>● LIVE</Text>
            </View>
          ) : (
            <Text style={styles.cardSub}>{days} days away</Text>
          )}
        </View>
      </View>

      <Text style={styles.cardDetail}>
        {event.country ? `${event.country}  ·  ` : ''}
        Season {event.season}  ·  Ends {new Date(event.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </Text>

      <TouchableOpacity
        style={[styles.ctaBtn, { backgroundColor: event.accentColor }]}
        onPress={() => router.push('/(tabs)/groups')}
      >
        <Text style={styles.ctaBtnText}>
          {live ? 'Go to My Groups →' : 'Create Group →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function EventsScreen() {
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const data = await getMajorEvents();
      setEvents(data);
    } catch {
      // silently fail — NBA card still shows
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor="#f97316"
        />
      }
    >
      <Text style={styles.screenTitle}>Big Events</Text>
      <Text style={styles.screenSub}>
        Predict major tournaments with your friends
      </Text>

      <NbaPlayoffCard />

      {loading ? (
        <ActivityIndicator color="#f97316" style={{ marginTop: 24 }} />
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No major football events in the next 90 days</Text>
        </View>
      ) : (
        events.map(ev => <FootballEventCard key={`${ev.id}-${ev.season}`} event={ev} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },

  screenTitle: {
    color: '#fff', fontSize: 22, fontWeight: '800',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4,
  },
  screenSub: {
    color: '#6b7280', fontSize: 13,
    paddingHorizontal: 16, paddingBottom: 16,
  },

  card: {
    backgroundColor: '#1a2634',
    marginHorizontal: 12, marginBottom: 12,
    borderRadius: 16, padding: 16,
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  cardEmoji: { fontSize: 32, lineHeight: 38 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 4 },
  cardSub: { fontSize: 12, color: '#9ca3af' },
  cardDetail: { fontSize: 13, color: '#6b7280', marginBottom: 12 },

  liveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ef444422',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6,
  },
  liveBadgeText: { color: '#ef4444', fontSize: 11, fontWeight: '800' },

  seriesList: { marginBottom: 12 },
  seriesRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#ffffff0f',
  },
  seriesMatchup: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  seriesScore: { color: '#9ca3af', fontSize: 13 },
  completedNote: { color: '#6b7280', fontSize: 12, marginTop: 6 },

  ctaBtn: { paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  ctaBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
});
