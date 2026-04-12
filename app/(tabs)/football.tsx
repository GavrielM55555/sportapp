import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import {
  getFootballGamesByDate,
  prefetchFootballDate,
  SUPPORTED_LEAGUES,
  FootballGame,
} from '../../src/api/apifootball';

// ── Date strip ────────────────────────────────────────────────────────────
function buildDateList() {
  const dates = [];
  const now = new Date();
  for (let i = -3; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const isToday = i === 0;
    const dayLabel = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dates.push({ iso, label, dayLabel, isToday });
  }
  return dates;
}
const DATE_LIST = buildDateList();
const TODAY_INDEX = 3;

const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map(l => l.id);

// ── Status helper ─────────────────────────────────────────────────────────
function getStatusInfo(game: FootballGame): { label: string; color: string; isLive: boolean } {
  if (game.status === 'live') {
    return {
      label: game.elapsed ? `${game.elapsed}'` : 'LIVE',
      color: '#ef4444',
      isLive: true,
    };
  }
  if (game.status === 'final') return { label: 'FT', color: '#4b5563', isLive: false };
  if (game.time) {
    try {
      const [h, m] = game.time.split(':');
      const d = new Date();
      d.setUTCHours(parseInt(h), parseInt(m));
      return {
        label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        color: '#9ca3af',
        isLive: false,
      };
    } catch {
      return { label: game.time, color: '#9ca3af', isLive: false };
    }
  }
  return { label: 'TBD', color: '#6b7280', isLive: false };
}

// ── Match Card ────────────────────────────────────────────────────────────
function MatchCard({ game }: { game: FootballGame }) {
  const { label, color, isLive } = getStatusInfo(game);
  const isFinal = game.status === 'final';
  const hasScore = game.homeScore !== null && game.awayScore !== null;
  const homeWin = isFinal && hasScore && game.homeScore! > game.awayScore!;
  const awayWin = isFinal && hasScore && game.awayScore! > game.homeScore!;

  return (
    <View style={[styles.card, isLive && styles.cardLive]}>
      {isLive && <View style={styles.liveStripe} />}

      <View style={styles.cardInner}>
        {/* Left: Teams */}
        <View style={styles.teamsCol}>
          <View style={styles.teamLine}>
            {game.homeTeam.logo
              ? <Image source={{ uri: game.homeTeam.logo }} style={styles.logo} />
              : <View style={[styles.logo, styles.logoPlaceholder]}><Text style={styles.logoText}>{game.homeTeam.name[0]}</Text></View>
            }
            <Text style={[styles.teamText, homeWin && styles.teamTextWinner]} numberOfLines={1}>
              {game.homeTeam.name}
            </Text>
          </View>
          <View style={styles.teamLine}>
            {game.awayTeam.logo
              ? <Image source={{ uri: game.awayTeam.logo }} style={styles.logo} />
              : <View style={[styles.logo, styles.logoPlaceholder]}><Text style={styles.logoText}>{game.awayTeam.name[0]}</Text></View>
            }
            <Text style={[styles.teamText, awayWin && styles.teamTextWinner]} numberOfLines={1}>
              {game.awayTeam.name}
            </Text>
          </View>
        </View>

        {/* Middle: Status */}
        <View style={styles.statusCol}>
          <Text style={[styles.statusLabel, { color }, isLive && styles.statusLabelLive]}>
            {isLive ? '●  ' : ''}{label}
          </Text>
        </View>

        {/* Right: Score */}
        <View style={styles.scoreCol}>
          {hasScore ? (
            <>
              <Text style={[styles.scoreNum, homeWin && styles.scoreWinner, isLive && styles.scoreLive]}>
                {game.homeScore}
              </Text>
              <Text style={[styles.scoreNum, awayWin && styles.scoreWinner, isLive && styles.scoreLive]}>
                {game.awayScore}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.scoreDash}>-</Text>
              <Text style={styles.scoreDash}>-</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────
export default function FootballScreen() {
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>(ALL_LEAGUE_IDS);
  const [selectedDateIndex, setSelectedDateIndex] = useState(TODAY_INDEX);
  const [games, setGames] = useState<FootballGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateScrollRef = useRef<ScrollView>(null);
  const requestGen = useRef(0);

  const selectedDate = DATE_LIST[selectedDateIndex].iso;

  const loadGames = useCallback(async (date: string, isRefresh = false) => {
    const gen = ++requestGen.current;
    setError(null);
    if (!isRefresh) { setLoading(true); setGames([]); }
    try {
      // 1 request for ALL leagues at once
      const all = await getFootballGamesByDate(date, ALL_LEAGUE_IDS);
      if (gen !== requestGen.current) return;
      setGames(all);

      // Pre-fetch next day silently
      const nextIdx = DATE_LIST.findIndex(d => d.iso === date) + 1;
      if (nextIdx < DATE_LIST.length) prefetchFootballDate(DATE_LIST[nextIdx].iso, ALL_LEAGUE_IDS);
    } catch (e: any) {
      if (gen !== requestGen.current) return;
      setError(e?.message?.includes('429') ? 'Too many requests — please wait.' : 'Failed to load fixtures.');
    } finally {
      if (gen !== requestGen.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadGames(selectedDate); }, [selectedDate]);

  useEffect(() => {
    setTimeout(() => {
      dateScrollRef.current?.scrollTo({ x: TODAY_INDEX * 68 - 80, animated: false });
    }, 100);
  }, []);

  // Auto-refresh live games every 60s
  useEffect(() => {
    if (!games.some(g => g.status === 'live')) return;
    const interval = setInterval(() => loadGames(selectedDate, true), 60_000);
    return () => clearInterval(interval);
  }, [games, selectedDate]);

  const toggleLeague = (id: number) => {
    setSelectedLeagues(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(l => l !== id) : prev
        : [...prev, id]
    );
  };

  // Filter games by selected leagues, group by league
  const visibleGames = games.filter(g => selectedLeagues.includes(g.leagueId));
  const liveCount = visibleGames.filter(g => g.status === 'live').length;

  const groupedByLeague = SUPPORTED_LEAGUES
    .filter(l => selectedLeagues.includes(l.id))
    .map(league => ({
      league,
      games: visibleGames.filter(g => g.leagueId === league.id),
    }))
    .filter(g => g.games.length > 0);

  return (
    <View style={styles.container}>

      {/* League filter bar */}
      <View style={styles.leagueBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leagueBarInner}>
          {SUPPORTED_LEAGUES.map(l => {
            const active = selectedLeagues.includes(l.id);
            return (
              <TouchableOpacity
                key={l.id}
                style={[styles.leagueChip, active && styles.leagueChipActive]}
                onPress={() => toggleLeague(l.id)}
              >
                <Text style={styles.leagueChipEmoji}>{l.logo}</Text>
                <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>
                  {l.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Date strip */}
      <View style={styles.dateBar}>
        <ScrollView ref={dateScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateBarInner}>
          {DATE_LIST.map((d, i) => {
            const sel = i === selectedDateIndex;
            return (
              <TouchableOpacity key={d.iso} style={[styles.dateChip, sel && styles.dateChipSelected]} onPress={() => setSelectedDateIndex(i)}>
                <Text style={[styles.dateDayText, sel && styles.dateTextSelected, d.isToday && !sel && styles.dateTodayText]}>
                  {d.dayLabel}
                </Text>
                <Text style={[styles.dateDateText, sel && styles.dateTextSelected]}>
                  {d.label}
                </Text>
                {d.isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Live banner */}
      {liveCount > 0 && !loading && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerText}>● {liveCount} match{liveCount > 1 ? 'es' : ''} live · refreshes every 60s</Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadGames(selectedDate)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGames(selectedDate, true); }} tintColor="#f97316" />}
        >
          {groupedByLeague.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>⚽</Text>
              <Text style={styles.emptyText}>No fixtures on this date</Text>
              <Text style={styles.emptySub}>Try a different date or league</Text>
            </View>
          ) : (
            groupedByLeague.map(({ league, games: lg }) => (
              <View key={league.id} style={styles.leagueSection}>
                <View style={styles.leagueHeader}>
                  <Text style={styles.leagueHeaderEmoji}>{league.logo}</Text>
                  <View>
                    <Text style={styles.leagueHeaderName}>{league.name}</Text>
                    <Text style={styles.leagueHeaderCountry}>{league.country}</Text>
                  </View>
                  <Text style={styles.leagueCount}>{lg.length} match{lg.length > 1 ? 'es' : ''}</Text>
                </View>
                {lg.map(game => <MatchCard key={game.id} game={game} />)}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  errorText: { color: '#9ca3af', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },

  // League filter
  leagueBar: { borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  leagueBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  leagueChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#1a2634', borderWidth: 1, borderColor: 'transparent',
  },
  leagueChipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  leagueChipEmoji: { fontSize: 13 },
  leagueChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  leagueChipTextActive: { color: '#f97316' },

  // Date bar
  dateBar: { borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  dateBarInner: { paddingHorizontal: 8, paddingVertical: 8, gap: 4, flexDirection: 'row' },
  dateChip: { width: 62, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  dateChipSelected: { backgroundColor: '#f97316' },
  dateDayText: { fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  dateDateText: { fontSize: 11, fontWeight: '700', color: '#9ca3af', marginTop: 1 },
  dateTextSelected: { color: '#fff' },
  dateTodayText: { color: '#f97316' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#f97316', marginTop: 2 },

  // Live banner
  liveBanner: { backgroundColor: '#1a0000', paddingHorizontal: 16, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#3d0000' },
  liveBannerText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },

  // League section
  leagueSection: { marginBottom: 4 },
  leagueHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1e2d3d',
  },
  leagueHeaderEmoji: { fontSize: 20 },
  leagueHeaderName: { fontSize: 13, fontWeight: '800', color: '#fff' },
  leagueHeaderCountry: { fontSize: 11, color: '#6b7280' },
  leagueCount: { marginLeft: 'auto', fontSize: 11, color: '#6b7280' },

  // Match card
  card: {
    backgroundColor: '#1a2634',
    marginHorizontal: 12, marginVertical: 1,
    borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: 'transparent',
  },
  cardLive: { borderColor: '#ef444422' },
  liveStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#ef4444' },
  cardInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },

  teamsCol: { flex: 1, gap: 8 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 20, height: 20, resizeMode: 'contain' },
  logoPlaceholder: { backgroundColor: '#374151', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  teamText: { fontSize: 13, fontWeight: '500', color: '#9ca3af', flex: 1 },
  teamTextWinner: { color: '#fff', fontWeight: '700' },

  statusCol: { width: 48, alignItems: 'center' },
  statusLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statusLabelLive: { fontWeight: '800' },

  scoreCol: { width: 28, alignItems: 'center', gap: 8 },
  scoreNum: { fontSize: 16, fontWeight: '700', color: '#9ca3af', textAlign: 'center' },
  scoreWinner: { color: '#fff', fontWeight: '800' },
  scoreLive: { color: '#f97316' },
  scoreDash: { fontSize: 16, color: '#374151', textAlign: 'center' },
});
