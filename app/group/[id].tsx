import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Image,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { doc, onSnapshot, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../src/firebase/config';
import { Group, GroupMember } from '../../src/types';
import { useAuthContext } from '../../src/context/AuthContext';
import { GroupPredictionsTab } from '../../src/components/GroupPredictionsTab';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthContext();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'leaderboard' | 'predictions'>('leaderboard');

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'groups', id), (snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() } as Group);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  if (!group) {
    return <View style={styles.center}><Text style={styles.errorText}>Group not found.</Text></View>;
  }

  const sortedMembers = [...group.members].sort((a, b) => b.totalPoints - a.totalPoints);

  const copyCode = async () => {
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareGroup = () => {
    Share.share({
      message: `Join my SportApp group "${group.name}"!\nCode: ${group.inviteCode}`,
    });
  };

  const isAdmin = user?.uid === group.adminUid;
  const typeLabel = group.type === 'playoff' ? '🏆 NBA Playoffs' : group.type === 'football' ? '⚽ Football' : '🏀 NBA Season';

  const deleteGroup = async () => {
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Delete "${group.name}"? This will delete all predictions and cannot be undone.`)
      : await new Promise<boolean>(resolve =>
          Alert.alert('Delete Group', `Delete "${group.name}"? Cannot be undone.`, [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
          ])
        );
    if (!confirmed) return;
    try {
      const batch = writeBatch(db);
      const cols = ['predictions', 'series_predictions', 'football_predictions', 'playoff_bonus_picks', 'championship_picks'];
      for (const col of cols) {
        const snap = await getDocs(query(collection(db, col), where('groupId', '==', group.id)));
        snap.docs.forEach(d => batch.delete(d.ref));
      }
      batch.delete(doc(db, 'groups', group.id));
      await batch.commit();
      router.replace('/(tabs)/groups');
    } catch (e) {
      alert('Failed to delete group.');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: group.name,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <Text style={{ color: '#f97316', fontSize: 16, fontWeight: '700' }}>← Back</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>

        {/* Invite card */}
        <View style={styles.inviteCard}>
          <View style={styles.inviteLeft}>
            <Text style={styles.inviteLabel}>{typeLabel} · Invite code</Text>
            <Text style={styles.inviteCode}>{group.inviteCode}</Text>
          </View>
          <View style={styles.inviteActions}>
            <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
              <Text style={styles.copyBtnText}>{copied ? '✓ Copied!' : '📋 Copy'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={shareGroup}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteGroup}>
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'leaderboard' && styles.tabBtnActive]}
            onPress={() => setTab('leaderboard')}
          >
            <Text style={[styles.tabText, tab === 'leaderboard' && styles.tabTextActive]}>
              Leaderboard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'predictions' && styles.tabBtnActive]}
            onPress={() => setTab('predictions')}
          >
            <Text style={[styles.tabText, tab === 'predictions' && styles.tabTextActive]}>
              Predictions
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'leaderboard' ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.sectionTitle}>{group.members.length} members</Text>
            {sortedMembers.map((member, index) => (
              <MemberRow
                key={member.uid}
                member={member}
                rank={index + 1}
                isMe={member.uid === user?.uid}
              />
            ))}
          </ScrollView>
        ) : (
          <GroupPredictionsTab group={group} />
        )}

      </View>
    </>
  );
}

function MemberRow({ member, rank, isMe }: { member: GroupMember; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return (
    <View style={[styles.memberRow, isMe && styles.memberRowMe]}>
      <Text style={styles.rank}>{medal ?? `#${rank}`}</Text>
      {member.photoURL ? (
        <Image source={{ uri: member.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{member.displayName[0]?.toUpperCase()}</Text>
        </View>
      )}
      <Text style={[styles.memberName, isMe && styles.memberNameMe]}>
        {member.displayName}{isMe ? ' (you)' : ''}
      </Text>
      <Text style={styles.points}>{member.totalPoints} pts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#9ca3af', fontSize: 16 },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2634',
    margin: 12, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f9731655',
  },
  inviteLeft: { flex: 1 },
  inviteLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  inviteCode: { fontSize: 22, fontWeight: '900', color: '#f97316', letterSpacing: 4 },
  inviteActions: { flexDirection: 'row', gap: 8 },
  copyBtn: { backgroundColor: '#f97316', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  shareBtn: { backgroundColor: '#0f1923', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#f97316' },
  shareBtnText: { color: '#f97316', fontWeight: '700', fontSize: 13 },

  tabs: { flexDirection: 'row', marginHorizontal: 12, marginBottom: 4, backgroundColor: '#1a2634', borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#f97316' },
  tabText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  sectionTitle: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 10 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2634',
    marginHorizontal: 12, marginVertical: 3, padding: 12, borderRadius: 10, gap: 10,
  },
  memberRowMe: { borderWidth: 1, borderColor: '#f97316' },
  rank: { fontSize: 16, width: 30, textAlign: 'center', color: '#9ca3af' },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarPlaceholder: { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 15 },
  memberName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#e5e7eb' },
  memberNameMe: { color: '#f97316' },
  points: { fontSize: 16, fontWeight: '800', color: '#fff' },
  deleteBtn: { backgroundColor: '#1a0000', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ef4444' },
  deleteBtnText: { fontSize: 14 },
});
