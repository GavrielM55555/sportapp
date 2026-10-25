import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useAuthContext } from '../../src/context/AuthContext';
import { usePreferences } from '../../src/hooks/usePreferences';
import { SPORTS } from '../../src/sports';
import { SUPPORTED_LEAGUES } from '../../src/api/apifootball';
import { BASKETBALL_LEAGUES } from '../../src/api/apibasketball';

function Chip({ active, emoji, label, onPress }: { active: boolean; emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Me: account + what you follow (drives Home and News) */
export default function MeScreen() {
  const { user, logout } = useAuthContext();
  const { prefs, toggleSport, toggleLeague, toggleBasketballLeague } = usePreferences();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account */}
      <View style={styles.account}>
        {user ? (
          <>
            {user.photoURL
              ? <Image source={{ uri: user.photoURL }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarEmpty]}><Text style={styles.avatarText}>{user.displayName?.[0] ?? '?'}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.displayName ?? 'Signed in'}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
            <TouchableOpacity style={styles.outlineBtn} onPress={logout}>
              <Text style={styles.outlineBtnText}>Sign out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Not signed in</Text>
              <Text style={styles.email}>Sign in to join prediction groups</Text>
            </View>
            <TouchableOpacity style={styles.fillBtn} onPress={() => router.push('/login')}>
              <Text style={styles.fillBtnText}>Sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Sports */}
      <Text style={styles.label}>My sports</Text>
      <Text style={styles.hint}>These show on Home and in your News feed.</Text>
      <View style={styles.sportGrid}>
        {SPORTS.map(sp => {
          const active = prefs.sports.includes(sp.id);
          return (
            <TouchableOpacity key={sp.id} style={[styles.sportCard, active && styles.sportCardActive]} onPress={() => toggleSport(sp.id)}>
              <Text style={styles.sportEmoji}>{sp.emoji}</Text>
              <Text style={[styles.sportName, active && styles.chipTextActive]}>{sp.label}</Text>
              <Text style={styles.sportDesc}>{sp.desc}</Text>
              {active && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>

      {prefs.sports.includes('football') && (
        <>
          <Text style={styles.label}>Football leagues</Text>
          <Text style={styles.hint}>{prefs.leagueIds.length === 0 ? 'None picked — the big leagues are shown by default.' : `${prefs.leagueIds.length} selected`}</Text>
          <View style={styles.wrap}>
            {SUPPORTED_LEAGUES.map(l => (
              <Chip key={l.id} active={prefs.leagueIds.includes(l.id)} emoji={l.logo} label={l.name} onPress={() => toggleLeague(l.id)} />
            ))}
          </View>
        </>
      )}

      {prefs.sports.includes('nba') && (
        <>
          <Text style={styles.label}>More basketball</Text>
          <Text style={styles.hint}>NBA is always included.</Text>
          <View style={styles.wrap}>
            {BASKETBALL_LEAGUES.map(l => (
              <Chip key={l.id} active={prefs.basketballLeagueIds.includes(l.id)} emoji={l.logo} label={`${l.name} · ${l.country}`} onPress={() => toggleBasketballLeague(l.id)} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  content: { padding: 16, paddingBottom: 48 },

  account: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a2634', borderRadius: 14, padding: 14, marginBottom: 24 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarEmpty: { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  email: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  outlineBtn: { borderWidth: 1, borderColor: '#6b7280', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  outlineBtnText: { color: '#9ca3af', fontWeight: '700', fontSize: 13 },
  fillBtn: { backgroundColor: '#f97316', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  fillBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  label: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  hint: { color: '#6b7280', fontSize: 12, marginTop: 4, marginBottom: 12 },

  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  sportCard: { width: '31%', flexGrow: 1, backgroundColor: '#1a2634', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  sportCardActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  sportEmoji: { fontSize: 28, marginBottom: 4 },
  sportName: { color: '#9ca3af', fontSize: 14, fontWeight: '800' },
  sportDesc: { color: '#6b7280', fontSize: 10, textAlign: 'center', marginTop: 2 },
  check: { position: 'absolute', top: 6, right: 6, backgroundColor: '#f97316', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1a2634', borderWidth: 1, borderColor: '#374151' },
  chipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  chipEmoji: { fontSize: 14 },
  chipText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#f97316' },
});
