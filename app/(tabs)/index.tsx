import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { getGamesByDates } from '../../src/api/balldontlie';
import { getFootballGamesByDate, getStandings, SUPPORTED_LEAGUES, FootballGame, FootballLeague, StandingRow } from '../../src/api/apifootball';
import { Game } from '../../src/types';
import { GameCard } from '../../src/components/GameCard';

type Sport = 'nba' | 'football';

// ── Date strip ────────────────────────────────────────────────────────────
function buildDateList() {
  const dates = [];
  const now = new Date();
  for (let i = -7; i <= 14; i++) {
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
const TODAY_INDEX = 7;
const ALL_LEAGUE_IDS = SUPPORTED_LEAGUES.map(l => l.id);

// ── Football match card ───────────────────────────────────────────────────
function getStatusInfo(game: FootballGame) {
  if (game.status === 'live') return { label: game.elapsed ? `${game.elapsed}'` : 'LIVE', color: '#ef4444', isLive: true };
  if (game.status === 'final') return { label: 'FT', color: '#4b5563', isLive: false };
  if (game.time) {
    try {
      const [h, m] = game.time.split(':');
      const d = new Date();
      d.setUTCHours(parseInt(h), parseInt(m));
      return { label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), color: '#9ca3af', isLive: false };
    } catch { return { label: game.time, color: '#9ca3af', isLive: false }; }
  }
  return { label: 'TBD', color: '#6b7280', isLive: false };
}

function FootballMatchCard({ game }: { game: FootballGame }) {
  const { label, color, isLive } = getStatusInfo(game);
  const isFinal = game.status === 'final';
  const hasScore = game.homeScore !== null && game.awayScore !== null;
  const homeWin = isFinal && hasScore && game.homeScore! > game.awayScore!;
  const awayWin = isFinal && hasScore && game.awayScore! > game.homeScore!;
  return (
    <View style={[styles.fCard, isLive && styles.fCardLive]}>
      {isLive && <View style={styles.fLiveStripe} />}
      <View style={styles.fInner}>
        <View style={styles.fTeams}>
          <View style={styles.fTeamRow}>
            {game.homeTeam.logo
              ? <Image source={{ uri: game.homeTeam.logo }} style={styles.fLogo} />
              : <View style={[styles.fLogo, styles.fLogoPlaceholder]}><Text style={styles.fLogoText}>{game.homeTeam.name[0]}</Text></View>}
            <Text style={[styles.fTeamName, homeWin && styles.fTeamWinner]} numberOfLines={1}>{game.homeTeam.name}</Text>
          </View>
          <View style={styles.fTeamRow}>
            {game.awayTeam.logo
              ? <Image source={{ uri: game.awayTeam.logo }} style={styles.fLogo} />
              : <View style={[styles.fLogo, styles.fLogoPlaceholder]}><Text style={styles.fLogoText}>{game.awayTeam.name[0]}</Text></View>}
            <Text style={[styles.fTeamName, awayWin && styles.fTeamWinner]} numberOfLines={1}>{game.awayTeam.name}</Text>
          </View>
        </View>
        <View style={styles.fStatus}>
          <Text style={[styles.fStatusText, { color }, isLive && styles.fStatusLive]}>{isLive ? '● ' : ''}{label}</Text>
        </View>
        <View style={styles.fScores}>
          {hasScore ? (
            <>
              <Text style={[styles.fScore, homeWin && styles.fScoreWinner, isLive && styles.fScoreLive]}>{game.homeScore}</Text>
              <Text style={[styles.fScore, awayWin && styles.fScoreWinner, isLive && styles.fScoreLive]}>{game.awayScore}</Text>
            </>
          ) : (
            <><Text style={styles.fScoreDash}>-</Text><Text style={styles.fScoreDash}>-</Text></>
          )}
        </View>
      </View>
    </View>
  );
}

// ── League section with Games / Table toggle ──────────────────────────────
function LeagueSection({ league, games }: { league: FootballLeague; games: FootballGame[] }) {
  const [view, setView] = useState<'games' | 'table'>('games');
  const [standings, setStandings] = useState<StandingRow[][]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState(false);

  const loadStandings = async () => {
    setStandingsLoading(true);
    setStandingsError(false);
    try {
      // Free plan caps at season 2024 (2024-25)
      const now = new Date();
      const season = Math.min(now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear(), 2024);
      const rows = await getStandings(league.id, season);
      setStandings(rows);
    } catch {
      setStandingsError(true);
    } finally {
      setStandingsLoading(false);
    }
  };

  const handleToggle = (next: 'games' | 'table') => {
    setView(next);
    if (next === 'table' && standings.length === 0 && !standingsLoading) {
      loadStandings();
    }
  };

  return (
    <View style={styles.leagueSection}>
      {/* Header row */}
      <View style={styles.leagueHeader}>
        <Text style={styles.leagueHeaderEmoji}>{league.logo}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.leagueHeaderName}>{league.name}</Text>
          <Text style={styles.leagueHeaderCountry}>{league.country}</Text>
        </View>
        {/* Games / Table toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'games' && styles.toggleBtnActive]}
            onPress={() => handleToggle('games')}
          >
            <Text style={[styles.toggleBtnText, view === 'games' && styles.toggleBtnTextActive]}>Games</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'table' && styles.toggleBtnActive]}
            onPress={() => handleToggle('table')}
          >
            <Text style={[styles.toggleBtnText, view === 'table' && styles.toggleBtnTextActive]}>Table</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Games view */}
      {view === 'games' && games.map(game => <FootballMatchCard key={game.id} game={game} />)}

      {/* Table view */}
      {view === 'table' && (
        standingsLoading ? (
          <View style={styles.tableCenter}><ActivityIndicator color="#f97316" /></View>
        ) : standingsError ? (
          <View style={styles.tableCenter}>
            <Text style={styles.tableError}>Failed to load table</Text>
            <TouchableOpacity onPress={loadStandings}><Text style={styles.tableRetry}>Retry</Text></TouchableOpacity>
          </View>
        ) : standings.length === 0 ? (
          <View style={styles.tableCenter}><Text style={styles.tableError}>No standings available</Text></View>
        ) : (
          standings.map((group, gi) => (
            <View key={gi}>
              {/* Column headers */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCell, styles.tableCellRank]}>#</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>Team</Text>
                <Text style={styles.tableCell}>P</Text>
                <Text style={styles.tableCell}>W</Text>
                <Text style={styles.tableCell}>D</Text>
                <Text style={styles.tableCell}>L</Text>
                <Text style={styles.tableCell}>GD</Text>
                <Text style={[styles.tableCell, styles.tableCellPts]}>Pts</Text>
              </View>
              {group.map((row, i) => (
                <View key={row.teamId} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                  <Text style={[styles.tableCell, styles.tableCellRank, styles.tableCellData]}>{row.rank}</Text>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Image source={{ uri: row.teamLogo }} style={styles.tableTeamLogo} />
                    <Text style={styles.tableTeamName} numberOfLines={1}>{row.teamName}</Text>
                  </View>
                  <Text style={[styles.tableCell, styles.tableCellData]}>{row.played}</Text>
                  <Text style={[styles.tableCell, styles.tableCellData]}>{row.win}</Text>
                  <Text style={[styles.tableCell, styles.tableCellData]}>{row.draw}</Text>
                  <Text style={[styles.tableCell, styles.tableCellData]}>{row.lose}</Text>
                  <Text style={[styles.tableCell, styles.tableCellData, { color: row.gd > 0 ? '#22c55e' : row.gd < 0 ? '#ef4444' : '#9ca3af' }]}>
                    {row.gd > 0 ? '+' : ''}{row.gd}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellPts, styles.tableCellData, styles.tableCellPtsVal]}>{row.points}</Text>
                </View>
              ))}
            </View>
          ))
        )
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────
// Football free plan: only yesterday/today/tomorrow
function getFootballDays() {
  return [-1, 0, 1].map(offset => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return {
      iso: d.toISOString().split('T')[0],
      label: offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow',
      offset,
    };
  });
}
const FOOTBALL_DAYS = getFootballDays();

export default function ScoresScreen() {
  const [sport, setSport] = useState<Sport>('nba');
  const [selectedDateIndex, setSelectedDateIndex] = useState(TODAY_INDEX);
  const [footballDayOffset, setFootballDayOffset] = useState(0); // -1, 0, 1
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>(ALL_LEAGUE_IDS);

  // NBA state
  const [nbaGames, setNbaGames] = useState<Game[]>([]);
  const [nbaLoading, setNbaLoading] = useState(true);
  const [nbaRefreshing, setNbaRefreshing] = useState(false);

  // Football state
  const [footballGames, setFootballGames] = useState<FootballGame[]>([]);
  const [footballLoading, setFootballLoading] = useState(false);
  const [footballRefreshing, setFootballRefreshing] = useState(false);
  const [footballError, setFootballError] = useState<string | null>(null);

  const dateScrollRef = useRef<ScrollView>(null);
  const nbaRequestGen = useRef(0);
  const footballRequestGen = useRef(0);

  const selectedDate = DATE_LIST[selectedDateIndex].iso;

  // ── NBA loader ──
  const loadNba = useCallback(async (date: string, isRefresh = false) => {
    const gen = ++nbaRequestGen.current;
    if (!isRefresh) { setNbaGames([]); setNbaLoading(true); }
    try {
      const data = await getGamesByDates([date]);
      if (gen !== nbaRequestGen.current) return;
      setNbaGames(data);
    } catch (e) {
      if (gen !== nbaRequestGen.current) return;
    } finally {
      if (gen !== nbaRequestGen.current) return;
      setNbaLoading(false);
      setNbaRefreshing(false);
    }
  }, []);

  // ── Football loader — loads selected date only (free plan: ±1 day window) ──
  const loadFootball = useCallback(async (date: string, isRefresh = false) => {
    const gen = ++footballRequestGen.current;
    setFootballError(null);
    if (!isRefresh) { setFootballGames([]); setFootballLoading(true); }
    try {
      const all = await getFootballGamesByDate(date, ALL_LEAGUE_IDS);
      if (gen !== footballRequestGen.current) return;
      setFootballGames(all);
    } catch (e: any) {
      if (gen !== footballRequestGen.current) return;
      console.error('[Football] load error:', e?.message ?? e);
      setFootballError(e?.message?.includes('429') ? 'Too many requests — wait a moment.' : 'Failed to load fixtures.');
    } finally {
      if (gen !== footballRequestGen.current) return;
      setFootballLoading(false);
      setFootballRefreshing(false);
    }
  }, []);

  const footballDate = FOOTBALL_DAYS.find(d => d.offset === footballDayOffset)!.iso;

  // NBA: load when date changes
  useEffect(() => { loadNba(selectedDate); }, [selectedDate]);

  // Football: load when football day changes
  useEffect(() => { if (sport === 'football') loadFootball(footballDate); }, [footballDayOffset]);

  // Switch sport: load football if first visit
  useEffect(() => {
    if (sport === 'football' && footballGames.length === 0 && !footballLoading) {
      loadFootball(footballDate);
    }
  }, [sport]);

  // Load NBA on mount + scroll date to today
  useEffect(() => {
    loadNba(selectedDate);
    setTimeout(() => {
      dateScrollRef.current?.scrollTo({ x: TODAY_INDEX * 66 - 100, animated: false });
    }, 100);
  }, []);

  // Auto-refresh live games every 60s
  useEffect(() => {
    const hasNbaLive = sport === 'nba' && nbaGames.some(g => g.status === 'live');
    const hasFootballLive = sport === 'football' && footballGames.some(g => g.status === 'live');
    if (!hasNbaLive && !hasFootballLive) return;
    const interval = setInterval(() => {
      if (hasNbaLive) loadNba(selectedDate, true);
      if (hasFootballLive) loadFootball(footballDate, true);
    }, 60_000);
    return () => clearInterval(interval);
  }, [nbaGames, footballGames, sport, selectedDate, footballDate]);

  const toggleLeague = (id: number) => {
    setSelectedLeagues(prev =>
      prev.includes(id) ? prev.length > 1 ? prev.filter(l => l !== id) : prev : [...prev, id]
    );
  };

  const visibleFootball = footballGames.filter(g => selectedLeagues.includes(g.leagueId));
  const footballLiveCount = visibleFootball.filter(g => g.status === 'live').length;
  const groupedFootball = SUPPORTED_LEAGUES
    .filter(l => selectedLeagues.includes(l.id))
    .map(league => ({ league, games: visibleFootball.filter(g => g.leagueId === league.id) }))
    .filter(g => g.games.length > 0);

  return (
    <View style={styles.container}>

      {/* ── Sport switcher ── */}
      <View style={styles.sportSwitcher}>
        <TouchableOpacity
          style={[styles.sportBtn, sport === 'nba' && styles.sportBtnActive]}
          onPress={() => setSport('nba')}
        >
          <Text style={[styles.sportBtnText, sport === 'nba' && styles.sportBtnTextActive]}>🏀 NBA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sportBtn, sport === 'football' && styles.sportBtnActive]}
          onPress={() => setSport('football')}
        >
          <Text style={[styles.sportBtnText, sport === 'football' && styles.sportBtnTextActive]}>⚽ Football</Text>
        </TouchableOpacity>
      </View>

      {/* ── NBA: full scrollable date strip ── */}
      {sport === 'nba' && (
        <View style={styles.dateBar}>
          <ScrollView ref={dateScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateBarInner}>
            {DATE_LIST.map((d, i) => {
              const sel = i === selectedDateIndex;
              return (
                <TouchableOpacity key={d.iso} style={[styles.dateChip, sel && styles.dateChipSel]} onPress={() => setSelectedDateIndex(i)}>
                  <Text style={[styles.dateDayText, sel && styles.dateTextSel, d.isToday && !sel && styles.dateTodayText]}>{d.dayLabel}</Text>
                  <Text style={[styles.dateDateText, sel && styles.dateTextSel]}>{d.label}</Text>
                  {d.isToday && <View style={styles.todayDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Football: league filter + 3-day selector ── */}
      {sport === 'football' && (
        <>
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
                    <Text style={[styles.leagueChipText, active && styles.leagueChipTextActive]}>{l.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.footballDayBar}>
            {FOOTBALL_DAYS.map(d => {
              const sel = d.offset === footballDayOffset;
              return (
                <TouchableOpacity
                  key={d.offset}
                  style={[styles.footballDayBtn, sel && styles.footballDayBtnSel]}
                  onPress={() => setFootballDayOffset(d.offset)}
                >
                  <Text style={[styles.footballDayText, sel && styles.footballDayTextSel]}>{d.label}</Text>
                  <Text style={[styles.footballDayDate, sel && styles.footballDayTextSel]}>{d.iso}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {footballLiveCount > 0 && !footballLoading && (
            <View style={styles.liveBanner}>
              <Text style={styles.liveBannerText}>● {footballLiveCount} live · auto-refreshes every 60s</Text>
            </View>
          )}
        </>
      )}

      {/* ── NBA Content ── */}
      {sport === 'nba' && (
        nbaLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>
        ) : (
          <FlatList
            data={nbaGames}
            keyExtractor={g => String(g.id)}
            renderItem={({ item }) => <GameCard game={item} />}
            refreshControl={<RefreshControl refreshing={nbaRefreshing} onRefresh={() => { setNbaRefreshing(true); loadNba(selectedDate, true); }} tintColor="#f97316" />}
            ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyText}>No NBA games on this date</Text></View>}
            contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
          />
        )
      )}

      {/* ── Football Content ── */}
      {sport === 'football' && (
        footballLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>
        ) : footballError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ {footballError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadFootball(footballDate)}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={footballRefreshing} onRefresh={() => { setFootballRefreshing(true); loadFootball(footballDate, true); }} tintColor="#f97316" />}
          >
            {groupedFootball.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyEmoji}>⚽</Text>
                <Text style={styles.emptyText}>No fixtures on this date</Text>
                <Text style={styles.emptySub}>Try a different league</Text>
              </View>
            ) : (
              groupedFootball.map(({ league, games: lg }) => (
                <LeagueSection key={league.id} league={league} games={lg} />
              ))
            )}
          </ScrollView>
        )
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

  // Sport switcher
  sportSwitcher: {
    flexDirection: 'row', backgroundColor: '#1a2634',
    margin: 12, borderRadius: 12, padding: 4,
  },
  sportBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  sportBtnActive: { backgroundColor: '#f97316' },
  sportBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  sportBtnTextActive: { color: '#fff' },

  // League filter
  leagueBar: { borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  leagueBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  leagueChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a2634', borderWidth: 1, borderColor: 'transparent' },
  leagueChipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  leagueChipEmoji: { fontSize: 13 },
  leagueChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  leagueChipTextActive: { color: '#f97316' },

  // Date bar
  dateBar: { borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  dateBarInner: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  dateChip: { width: 62, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  dateChipSel: { backgroundColor: '#f97316' },
  dateDayText: { fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  dateDateText: { fontSize: 11, fontWeight: '700', color: '#9ca3af', marginTop: 1 },
  dateTextSel: { color: '#fff' },
  dateTodayText: { color: '#f97316' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#f97316', marginTop: 2 },

  // Football day selector
  footballDayBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  footballDayBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  footballDayBtnSel: { borderBottomWidth: 2, borderBottomColor: '#f97316' },
  footballDayText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  footballDayDate: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  footballDayTextSel: { color: '#f97316' },

  // Live banner
  liveBanner: { backgroundColor: '#1a0000', paddingHorizontal: 16, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#3d0000' },
  liveBannerText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },

  // League section
  leagueSection: { marginBottom: 4 },
  leagueHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  leagueHeaderEmoji: { fontSize: 20 },
  leagueHeaderName: { fontSize: 13, fontWeight: '800', color: '#fff' },
  leagueHeaderCountry: { fontSize: 11, color: '#6b7280' },
  leagueCount: { fontSize: 11, color: '#6b7280' },

  // Games / Table toggle
  viewToggle: { flexDirection: 'row', backgroundColor: '#0f1923', borderRadius: 8, padding: 2 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: '#f97316' },
  toggleBtnText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  toggleBtnTextActive: { color: '#fff' },

  // Standings table
  tableCenter: { alignItems: 'center', padding: 20 },
  tableError: { color: '#6b7280', fontSize: 13 },
  tableRetry: { color: '#f97316', fontSize: 13, fontWeight: '700', marginTop: 6 },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e2d3d', backgroundColor: '#0f1923' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  tableRowAlt: { backgroundColor: '#111e2a' },
  tableCell: { width: 24, textAlign: 'center', fontSize: 11, color: '#6b7280', fontWeight: '600' },
  tableCellRank: { width: 20 },
  tableCellPts: { width: 28 },
  tableCellData: { color: '#d1d5db' },
  tableCellPtsVal: { color: '#f97316', fontWeight: '800' },
  tableTeamLogo: { width: 16, height: 16, resizeMode: 'contain' },
  tableTeamName: { fontSize: 12, fontWeight: '600', color: '#fff', flex: 1 },

  // Football match card
  fCard: { backgroundColor: '#1a2634', marginHorizontal: 12, marginVertical: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  fCardLive: { borderColor: '#ef444422' },
  fLiveStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#ef4444' },
  fInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  fTeams: { flex: 1, gap: 8 },
  fTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fLogo: { width: 20, height: 20, resizeMode: 'contain' },
  fLogoPlaceholder: { backgroundColor: '#374151', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fLogoText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  fTeamName: { fontSize: 13, fontWeight: '500', color: '#9ca3af', flex: 1 },
  fTeamWinner: { color: '#fff', fontWeight: '700' },
  fStatus: { width: 48, alignItems: 'center' },
  fStatusText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  fStatusLive: { fontWeight: '800' },
  fScores: { width: 28, alignItems: 'center', gap: 8 },
  fScore: { fontSize: 16, fontWeight: '700', color: '#9ca3af', textAlign: 'center' },
  fScoreWinner: { color: '#fff', fontWeight: '800' },
  fScoreLive: { color: '#f97316' },
  fScoreDash: { fontSize: 16, color: '#374151', textAlign: 'center' },
});
