import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { usePreferences, SportPref } from '../src/hooks/usePreferences';
import { SUPPORTED_LEAGUES } from '../src/api/apifootball';

const SPORTS: { id: SportPref; label: string; emoji: string; desc: string }[] = [
  { id: 'nba', label: 'NBA', emoji: '🏀', desc: 'Regular season & playoffs' },
  { id: 'football', label: 'Football', emoji: '⚽', desc: 'Premier League, La Liga & more' },
];

export default function OnboardingScreen() {
  const { prefs, toggleSport, toggleLeague, completeOnboarding, save } = usePreferences();
  const [localSports, setLocalSports] = useState<SportPref[]>([]);
  const [localLeagues, setLocalLeagues] = useState<number[]>([]);

  const toggleLocalSport = (id: SportPref) => {
    setLocalSports(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
    if (id === 'football' && localSports.includes('football')) {
      setLocalLeagues([]);
    }
  };

  const toggleLocalLeague = (id: number) => {
    setLocalLeagues(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const hasFootball = localSports.includes('football');
  const canFinish = localSports.length > 0 && (!hasFootball || localLeagues.length > 0);

  const handleDone = async () => {
    await save({ sports: localSports, leagueIds: localLeagues, onboardingDone: true });
    router.replace('/(tabs)/foryou');
  };

  const handleSkip = async () => {
    await save({ sports: [], leagueIds: [], onboardingDone: true });
    router.replace('/(tabs)/foryou');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🏆</Text>
          <Text style={styles.heroTitle}>Welcome to SportApp</Text>
          <Text style={styles.heroSub}>Pick the sports you follow and we'll personalise your feed.</Text>
        </View>

        {/* Sport picker */}
        <Text style={styles.sectionLabel}>Choose your sports</Text>
        <View style={styles.sportRow}>
          {SPORTS.map(s => {
            const active = localSports.includes(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.sportCard, active && styles.sportCardActive]}
                onPress={() => toggleLocalSport(s.id)}
              >
                <Text style={styles.sportEmoji}>{s.emoji}</Text>
                <Text style={[styles.sportLabel, active && styles.sportLabelActive]}>{s.label}</Text>
                <Text style={styles.sportDesc}>{s.desc}</Text>
                {active && <View style={styles.checkBadge}><Text style={styles.checkText}>✓</Text></View>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* League picker — only if football selected */}
        {hasFootball && (
          <View style={styles.leagueSection}>
            <Text style={styles.sectionLabel}>
              Which leagues?{localLeagues.length === 0 ? '  ⚠️ Pick at least one' : ` · ${localLeagues.length} selected`}
            </Text>
            <View style={styles.leagueGrid}>
              {SUPPORTED_LEAGUES.map(l => {
                const active = localLeagues.includes(l.id);
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.leagueChip, active && styles.leagueChipActive]}
                    onPress={() => toggleLocalLeague(l.id)}
                  >
                    <Text style={styles.leagueEmoji}>{l.logo}</Text>
                    <Text style={[styles.leagueName, active && styles.leagueNameActive]}>{l.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.doneBtn, !canFinish && styles.doneBtnDisabled]}
            onPress={handleDone}
            disabled={!canFinish}
          >
            <Text style={styles.doneBtnText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1923' },
  scroll: { padding: 24, paddingBottom: 48 },

  hero: { alignItems: 'center', marginBottom: 36, marginTop: 16 },
  heroEmoji: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' },
  heroSub: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  sportRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  sportCard: {
    flex: 1, backgroundColor: '#1a2634', borderRadius: 16, padding: 20,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  sportCardActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  sportEmoji: { fontSize: 36, marginBottom: 8 },
  sportLabel: { fontSize: 16, fontWeight: '800', color: '#9ca3af', marginBottom: 4 },
  sportLabelActive: { color: '#f97316' },
  sportDesc: { fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 15 },
  checkBadge: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#f97316', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  checkText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  leagueSection: { marginBottom: 32 },
  leagueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  leagueChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#1a2634', borderWidth: 1, borderColor: '#374151',
  },
  leagueChipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  leagueEmoji: { fontSize: 15 },
  leagueName: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  leagueNameActive: { color: '#f97316' },

  actions: { gap: 12 },
  doneBtn: { backgroundColor: '#f97316', padding: 16, borderRadius: 14, alignItems: 'center' },
  doneBtnDisabled: { opacity: 0.4 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  skipBtn: { alignItems: 'center', padding: 12 },
  skipText: { color: '#6b7280', fontSize: 15 },
});
