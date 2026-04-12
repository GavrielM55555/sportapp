import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthContext } from '../../src/context/AuthContext';
import { useGroups } from '../../src/hooks/useGroups';
import { GroupType } from '../../src/types';
import { SUPPORTED_LEAGUES } from '../../src/api/apifootball';

const GROUP_TYPES: { type: GroupType; label: string; icon: string; desc: string }[] = [
  {
    type: 'season',
    label: 'NBA Season',
    icon: '🏀',
    desc: 'Predict any NBA game before tip-off. Points accumulate all season.',
  },
  {
    type: 'playoff',
    label: 'NBA Playoffs',
    icon: '🏆',
    desc: 'Predict every playoff series before each round starts.',
  },
  {
    type: 'football',
    label: 'Football',
    icon: '⚽',
    desc: 'Predict soccer matches from Premier League, La Liga, Bundesliga and more.',
  },
];

export default function GroupsScreen() {
  const { user, logout } = useAuthContext();
  const { groups, loading, createGroup, joinGroupByCode } = useGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('season');
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleLeague = (id: number) => {
    setSelectedLeagues(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Join the competition</Text>
        <Text style={styles.emptyText}>Sign in to create groups and predict games with friends.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.push('/login')}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      const id = await createGroup(
        groupName.trim(),
        groupType,
        groupType === 'football' ? selectedLeagues : undefined
      );
      setGroupName('');
      setGroupType('season');
      setSelectedLeagues([]);
      setShowCreate(false);
      router.push(`/group/${id}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to create group.');
    } finally {
      setSaving(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    try {
      const id = await joinGroupByCode(joinCode.trim());
      setJoinCode('');
      setShowJoin(false);
      if (id) router.push(`/group/${id}`);
      else Alert.alert('Not found', 'No group found with that code.');
    } catch (e) {
      Alert.alert('Error', 'Failed to join group.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.actionBtnText}>+ Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => setShowJoin(true)}>
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Join with Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={logout}>
          <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.groupCard} onPress={() => router.push(`/group/${item.id}`)}>
            <View style={styles.groupInfo}>
              <View style={styles.groupNameRow}>
                <Text style={styles.groupTypeIcon}>
                  {item.type === 'playoff' ? '🏆' : item.type === 'football' ? '⚽' : '🏀'}
                </Text>
                <Text style={styles.groupName}>{item.name}</Text>
              </View>
              <Text style={styles.groupMeta}>
                {item.type === 'playoff' ? 'NBA Playoffs' : item.type === 'football' ? 'Football' : 'NBA Season'} · {item.members.length} members
              </Text>
              <Text style={styles.groupCode}>Code: {item.inviteCode}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyText}>Create one or ask a friend for their invite code.</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}
      />

      {/* Create group modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create a Group</Text>

            <TextInput
              style={styles.input}
              placeholder="Group name (e.g. Boys 2025)"
              placeholderTextColor="#6b7280"
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
            />

            <Text style={styles.typeLabel}>Group type</Text>
            <View style={styles.typeRow}>
              {GROUP_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.type}
                  style={[styles.typeCard, groupType === t.type && styles.typeCardSelected]}
                  onPress={() => setGroupType(t.type)}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text style={[styles.typeName, groupType === t.type && styles.typeNameSelected]}>
                    {t.label}
                  </Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* League picker — only shown for football groups */}
            {groupType === 'football' && (
              <View style={styles.leaguePickerSection}>
                <Text style={styles.typeLabel}>
                  Choose leagues to predict{selectedLeagues.length === 0 ? '  ⚠️ Pick at least one' : ` · ${selectedLeagues.length} selected`}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leaguePickerRow}>
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
            )}

            <TouchableOpacity
              style={[styles.btn, (!groupName.trim() || saving || (groupType === 'football' && selectedLeagues.length === 0)) && styles.btnDisabled]}
              onPress={handleCreateGroup}
              disabled={!groupName.trim() || saving || (groupType === 'football' && selectedLeagues.length === 0)}
            >
              <Text style={styles.btnText}>{saving ? 'Creating...' : 'Create Group'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join group modal */}
      <Modal visible={showJoin} transparent animationType="slide" onRequestClose={() => setShowJoin(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Join a Group</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter invite code (e.g. AB12CD)"
              placeholderTextColor="#6b7280"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.btn, (!joinCode.trim() || saving) && styles.btnDisabled]}
              onPress={handleJoinGroup}
              disabled={!joinCode.trim() || saving}
            >
              <Text style={styles.btnText}>{saving ? 'Joining...' : 'Join Group'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowJoin(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  actionsRow: { flexDirection: 'row', gap: 12, padding: 16 },
  actionBtn: {
    flex: 1, backgroundColor: '#f97316', paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: '#1a2634', borderWidth: 1, borderColor: '#f97316' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionBtnTextSecondary: { color: '#f97316' },
  groupCard: {
    backgroundColor: '#1a2634', borderRadius: 12, padding: 16,
    marginHorizontal: 16, marginVertical: 5, flexDirection: 'row', alignItems: 'center',
  },
  groupInfo: { flex: 1 },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTypeIcon: { fontSize: 16 },
  groupName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  groupMeta: { fontSize: 13, color: '#6b7280', marginTop: 3 },
  groupCode: { fontSize: 12, color: '#f97316', marginTop: 4, fontWeight: '700', letterSpacing: 1 },
  chevron: { color: '#6b7280', fontSize: 24, marginLeft: 4 },
  emptyCard: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1a2634', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  input: {
    backgroundColor: '#0f1923', color: '#fff', fontSize: 16,
    borderRadius: 10, padding: 14, marginBottom: 16,
  },
  typeLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeCard: {
    flex: 1, backgroundColor: '#0f1923', borderRadius: 12, padding: 14,
    borderWidth: 2, borderColor: 'transparent', alignItems: 'center',
  },
  typeCardSelected: { borderColor: '#f97316' },
  typeIcon: { fontSize: 24, marginBottom: 6 },
  typeName: { fontSize: 13, fontWeight: '700', color: '#9ca3af', textAlign: 'center', marginBottom: 4 },
  typeNameSelected: { color: '#f97316' },
  typeDesc: { fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 15 },
  btn: { backgroundColor: '#f97316', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelText: { color: '#6b7280', fontSize: 15 },

  // League picker
  leaguePickerSection: { marginBottom: 20 },
  leaguePickerRow: { gap: 8, paddingVertical: 4 },
  leagueChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    backgroundColor: '#0f1923', borderWidth: 1, borderColor: '#374151',
  },
  leagueChipActive: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  leagueChipEmoji: { fontSize: 14 },
  leagueChipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  leagueChipTextActive: { color: '#f97316' },
});
