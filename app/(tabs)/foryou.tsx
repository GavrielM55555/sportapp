import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  ActivityIndicator, RefreshControl, Image, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences, SportPref } from '../../src/hooks/usePreferences';
import { getGamesByDates } from '../../src/api/balldontlie';
import {
  getFootballGamesByDate, SUPPORTED_LEAGUES, FootballGame, FootballLeague,
} from '../../src/api/apifootball';
import { Game } from '../../src/types';
import { GameCard } from '../../src/components/GameCard';

// ── Date helpers ───────────────────────────────────────────────────────────
function localIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDateList() {
  const dates = [];
  const now = new Date();
  for (let i = -7; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = localIso(d);
    const isToday = i === 0;
    dates.push({
      iso,
      isToday,
      dayLabel: isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return dates;
}
const DATE_LIST = buildDateList();
const TODAY_IDX = 7;

function getFootballDays() {
  return [-1, 0, 1].map(offset => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return {
      offset,
      iso: localIso(d),
      label: offset === -1 ? 'Yesterday' : offset === 0 ? 'Today' : 'Tomorrow',
    };
  });
}
const FOOTBALL_DAYS = getFootballDays();

// ── Football match card (inlined from index.tsx) ───────────────────────────
function getStatusInfo(game: FootballGame) {
  if (game.status === 'live') return { label: game.elapsed ? `${game.elapsed}'` : 'LIVE', color: '#ef4444', isLive: true };
  if (game.status === 'final') return { label: 'FT', color: '#4b5563', isLive: false };
  if (game.time) {
    try {
      const [h, m] = game.time.split(':');
      const d = new Date(); d.setUTCHours(parseInt(h), parseInt(m));
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

// ── Edit preferences modal ─────────────────────────────────────────────────
const SPORTS_LIST: { id: SportPref; label: string; emoji: string }[] = [
  { id: 'nba', label: 'NBA', emoji: '🏀' },
  { id: 'football', label: 'Football', emoji: '⚽' },
];

function EditPrefsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { prefs, toggleSport, toggleLeague } = usePreferences();
  const hasFootball = prefs.sports.includes('football');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>My Preferences</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
          </View>

          <Text style={styles.modalSectionLabel}>Sports</Text>
          <View style={styles.modalSportRow}>
            {SPORTS_LIST.map(s => {
              const active = prefs.sports.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.modalSportCard, active && styles.modalSportCardActive]}
                  onPress={() => toggleSport(s.id)}
                >
                  <Text style={styles.modalSportEmoji}>{s.emoji}</Text>
                  <Text style={[styles.modalSportLabel, active && styles.modalSportLabelActive]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {hasFootball && (
            <>
              <Text style={styles.modalSectionLabel}>Football Leagues</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={styles.leagueChipRow}>
                  {SUPPORTED_LEAGUES.map(l => {
                    const active = prefs.leagueIds.includes(l.id);
                    return (
                      <TouchableOpacity
                        key={l.id}
                        style={[styles.leagueChip, active && styles.leagueChipActive]}
                        onPress={() => toggleLeague(l.id)}
                      >
                        <Text style={styles.leagueEmoji}>{l.logo}</Text>
                        <Text style={[styles.leagueName, active && styles.leagueNameActive]}>{l.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}

          <TouchableOpacity style={styles.modalDoneBtn} onPress={onClose}>
            <Text style={styles.modalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────
export default function ForYouScreen() {
  const { prefs, loaded } = usePreferences();
  const [showEdit, setShowEdit] = useState(false);

  // Redirect to onboarding on first launch
  useEffect(() => {
    if (loaded && !prefs.onboardingDone) {
      router.replace('/onboarding');
    }
  }, [loaded, prefs.onboardingDone]);

  const hasNba = prefs.sports.includes('nba');
  const hasFootball = prefs.sports.includes('football');
  const noSports = prefs.sports.length === 0;

  // Active sport tab (when both selected)
  const [activeSport, setActiveSport] = useState<SportPref>('nba');

  // NBA state
  const [nbaDateIdx, setNbaDateIdx] = useState(TODAY_IDX);
  const [nbaGames, setNbaGames] = useState<Game[]>([]);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [nbaRefreshing, setNbaRefreshing] = useState(false);
  const nbaGen = useRef(0);
  const dateScrollRef = useRef<ScrollView>(null);

  // Football state
  const [fbDayOffset, setFbDayOffset] = useState(0);
  const [fbGames, setFbGames] = useState<FootballGame[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbRefreshing, setFbRefreshing] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const fbGen = useRef(0);

  const selectedNbaDate = DATE_LIST[nbaDateIdx].iso;
  const selectedFbDate = FOOTBALL_DAYS.find(d => d.offset === fbDayOffset)!.iso;

  const loadNba = useCallback(async (date: string, isRefresh = false) => {
    const gen = ++nbaGen.current;
    if (!isRefresh) { setNbaGames([]); setNbaLoading(true); }
    try {
      const data = await getGamesByDates([date]);
      if (gen !== nbaGen.current) return;
      setNbaGames(data);
    } catch { /* silent */ } finally {
      if (gen !== nbaGen.current) return;
      setNbaLoading(false);
      setNbaRefreshing(false);
    }
  }, []);

  const loadFootball = useCallback(async (date: string, isRefresh = false) => {
    const gen = ++fbGen.current;
    setFbError(null);
    if (!isRefresh) { setFbGames([]); setFbLoading(true); }
    const leagueIds = prefs.leagueIds.length > 0 ? prefs.leagueIds : SUPPORTED_LEAGUES.map(l => l.id);
    try {
      const all = await getFootballGamesByDate(date, leagueIds);
      if (gen !== fbGen.current) return;
      setFbGames(all);
    } catch (e: any) {
      if (gen !== fbGen.current) return;
      setFbError('Failed to load fixtures.');
    } finally {
      if (gen !== fbGen.current) return;
      setFbLoading(false);
      setFbRefreshing(false);
    }
  }, [prefs.leagueIds]);

  // Load NBA on mount + date change
  useEffect(() => {
    if (hasNba) loadNba(selectedNbaDate);
  }, [selectedNbaDate, hasNba]);

  // Load football on mount + day change
  useEffect(() => {
    if (hasFootball) loadFootball(selectedFbDate);
  }, [fbDayOffset, hasFootball]);

  // Scroll date strip to today
  useEffect(() => {
    setTimeout(() => {
      dateScrollRef.current?.scrollTo({ x: TODAY_IDX * 66 - 100, animated: false });
    }, 100);
  }, []);

  // Set default sport tab when prefs load
  useEffect(() => {
    if (hasNba) setActiveSport('nba');
    else if (hasFootball) setActiveSport('football');
  }, [prefs.sports]);

  if (!loaded) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  // Football grouped by league
  const leagueIds = prefs.leagueIds.length > 0 ? prefs.leagueIds : SUPPORTED_LEAGUES.map(l => l.id);
  const groupedFb = SUPPORTED_LEAGUES
    .filter(l => leagueIds.includes(l.id))
    .map(league => ({ league, games: fbGames.filter(g => g.leagueId === league.id) }))
    .filter(g => g.games.length > 0);

  // Determine which sport to show
  const showBothToggle = hasNba && hasFootball;
  const currentSport = showBothToggle ? activeSport : (hasNba ? 'nba' : 'football');

  return (
    <View style={styles.container}>
      {/* Header with edit button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>For You</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEdit(true)}>
          <Ionicons name="options-outline" size={20} color="#f97316" />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Empty state — no sports selected */}
      {noSports && (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyText}>Tap Edit to pick your sports and leagues.</Text>
          <TouchableOpacity style={styles.setupBtn} onPress={() => setShowEdit(true)}>
            <Text style={styles.setupBtnText}>Set Up My Feed</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sport switcher — only when both selected */}
      {showBothToggle && (
        <View style={styles.sportSwitcher}>
          <TouchableOpacity
            style={[styles.sportBtn, currentSport === 'nba' && styles.sportBtnActive]}
            onPress={() => setActiveSport('nba')}
          >
            <Text style={[styles.sportBtnText, currentSport === 'nba' && styles.sportBtnTextActive]}>🏀 NBA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sportBtn, currentSport === 'football' && styles.sportBtnActive]}
            onPress={() => setActiveSport('football')}
          >
            <Text style={[styles.sportBtnText, currentSport === 'football' && styles.sportBtnTextActive]}>⚽ Football</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* NBA section */}
      {!noSports && currentSport === 'nba' && (
        <>
          {/* Date strip */}
          <View style={styles.dateBar}>
            <ScrollView ref={dateScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateBarInner}>
              {DATE_LIST.map((d, i) => {
                const sel = i === nbaDateIdx;
                return (
                  <TouchableOpacity key={d.iso} style={[styles.dateChip, sel && styles.dateChipSel]} onPress={() => setNbaDateIdx(i)}>
                    <Text style={[styles.dateDayText, sel && styles.dateTextSel, d.isToday && !sel && styles.dateTodayText]}>{d.dayLabel}</Text>
                    <Text style={[styles.dateDateText, sel && styles.dateTextSel]}>{d.label}</Text>
                    {d.isToday && <View style={styles.todayDot} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          {nbaLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>
          ) : (
            <FlatList
              data={nbaGames}
              keyExtractor={g => String(g.id)}
              renderItem={({ item }) => <GameCard game={item} />}
              refreshControl={<RefreshControl refreshing={nbaRefreshing} onRefresh={() => { setNbaRefreshing(true); loadNba(selectedNbaDate, true); }} tintColor="#f97316" />}
              ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyText}>No NBA games on this date</Text></View>}
              contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
            />
          )}
        </>
      )}

      {/* Football section */}
      {!noSports && currentSport === 'football' && (
        <>
          {/* 3-day selector */}
          <View style={styles.footballDayBar}>
            {FOOTBALL_DAYS.map(d => {
              const sel = d.offset === fbDayOffset;
              return (
                <TouchableOpacity
                  key={d.offset}
                  style={[styles.footballDayBtn, sel && styles.footballDayBtnSel]}
                  onPress={() => setFbDayOffset(d.offset)}
                >
                  <Text style={[styles.footballDayText, sel && styles.footballDayTextSel]}>{d.label}</Text>
                  <Text style={[styles.footballDayDate, sel && styles.footballDayTextSel]}>{d.iso}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fbLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>
          ) : fbError ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>⚠️ {fbError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => loadFootball(selectedFbDate)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={fbRefreshing} onRefresh={() => { setFbRefreshing(true); loadFootball(selectedFbDate, true); }} tintColor="#f97316" />}
            >
              {groupedFb.length === 0 ? (
                <View style={styles.center}>
                  <Text style={styles.emptyEmoji}>⚽</Text>
                  <Text style={styles.emptyText}>No fixtures on this date</Text>
                </View>
              ) : (
                groupedFb.map(({ league, games }) => (
                  <View key={league.id} style={styles.leagueSection}>
                    <View style={styles.leagueHeader}>
                      <Text style={styles.leagueHeaderEmoji}>{league.logo}</Text>
                      <View>
                        <Text style={styles.leagueHeaderName}>{league.name}</Text>
                        <Text style={styles.leagueHeaderCountry}>{league.country}</Text>
                      </View>
                    </View>
                    {games.map(game => <FootballMatchCard key={game.id} game={game} />)}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </>
      )}

      <EditPrefsModal visible={showEdit} onClose={() => setShowEdit(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1e2d3d',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1a2634' },
  editBtnText: { color: '#f97316', fontWeight: '700', fontSize: 13 },

  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#9ca3af', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  setupBtn: { marginTop: 20, backgroundColor: '#f97316', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  setupBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Sport switcher
  sportSwitcher: { flexDirection: 'row', backgroundColor: '#1a2634', margin: 12, borderRadius: 12, padding: 4 },
  sportBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  sportBtnActive: { backgroundColor: '#f97316' },
  sportBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  sportBtnTextActive: { color: '#fff' },

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

  // League section
  leagueSection: { marginBottom: 4 },
  leagueHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e2d3d' },
  leagueHeaderEmoji: { fontSize: 20 },
  leagueHeaderName: { fontSize: 13, fontWeight: '800', color: '#fff' },
  leagueHeaderCountry: { fontSize: 11, color: '#6b7280' },

  // Football card
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

  // Edit modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1a2634', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  modalSectionLabel: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  modalSportRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  modalSportCard: { flex: 1, backgroundColor: '#0f1923', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  modalSportCardActive: { borderColor: '#f97316' },
  modalSportEmoji: { fontSize: 28, marginBottom: 6 },
  modalSportLabel: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  modalSportLabelActive: { color: '#f97316' },
  leagueChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  leagueChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#0f1923', borderWidth: 1, borderColor: '#374151' },
  leagueChipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  leagueEmoji: { fontSize: 14 },
  leagueName: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  leagueNameActive: { color: '#f97316' },
  modalDoneBtn: { backgroundColor: '#f97316', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  modalDoneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
