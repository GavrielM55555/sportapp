import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, Href } from 'expo-router';
import { SPORTS, SportId } from '../../src/sports';
import { usePreferences } from '../../src/hooks/usePreferences';
import { SportTabs } from '../../src/components/scores/SportTabs';
import { SportScores } from '../../src/components/scores/SportScores';

/** Home: just the sports you follow */
export default function HomeScreen() {
  const { prefs, loaded } = usePreferences();
  const mySports = SPORTS.filter(s => prefs.sports.includes(s.id));
  const [sport, setSport] = useState<SportId | null>(null);

  // First launch → pick sports
  useEffect(() => {
    if (loaded && !prefs.onboardingDone) router.replace('/onboarding');
  }, [loaded, prefs.onboardingDone]);

  // Keep the selection valid as favourites change
  useEffect(() => {
    if (!sport || !prefs.sports.includes(sport)) setSport(prefs.sports[0] ?? null);
  }, [prefs.sports.join(',')]);

  if (!loaded) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  return (
    <View style={styles.container}>
      {mySports.length === 0 || !sport ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyText}>Pick the sports you follow and they'll show up here.</Text>
          <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/(tabs)/me' as Href)}>
            <Text style={styles.setupBtnText}>Choose my sports</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {mySports.length > 1 && <SportTabs sports={mySports} value={sport} onChange={setSport} />}
          <SportScores sport={sport} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  setupBtn: { backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  setupBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
