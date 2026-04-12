import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthContext } from '../context/AuthContext';
import { Game, GamePrediction } from '../types';

interface Props {
  game: Game;
  groupId?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function PredictGameModal({ game, groupId, onClose, onSaved }: Props) {
  const { user } = useAuthContext();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !selectedTeamId) return;
    if (!groupId) {
      Alert.alert('Join a group first', 'You need to be in a group to make predictions.');
      onClose();
      return;
    }

    setSaving(true);
    console.log('[PredictGameModal] saving prediction for game', game.id, 'group', groupId);
    try {
      // Firestore rejects undefined — only include score fields if filled in
      const prediction: any = {
        uid: user.uid,
        groupId,
        gameId: game.id,
        predictedWinnerTeamId: selectedTeamId,
        submittedAt: Date.now(),
      };
      if (homeScore) prediction.predictedHomeScore = parseInt(homeScore);
      if (awayScore) prediction.predictedAwayScore = parseInt(awayScore);

      // Check if prediction already exists
      const q = query(
        collection(db, 'predictions'),
        where('uid', '==', user.uid),
        where('groupId', '==', groupId),
        where('gameId', '==', game.id)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, 'predictions', existing.docs[0].id), prediction);
      } else {
        await addDoc(collection(db, 'predictions'), prediction);
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error('[PredictGameModal] error:', e);
      Alert.alert('Error saving', e?.message ?? 'Failed to save prediction. Check console.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Predict this game</Text>
          <Text style={styles.matchup}>
            {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
          </Text>

          <Text style={styles.label}>Who wins?</Text>
          <View style={styles.teamRow}>
            {[game.awayTeam, game.homeTeam].map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[styles.teamBtn, selectedTeamId === team.id && styles.teamBtnSelected]}
                onPress={() => setSelectedTeamId(team.id)}
              >
                <Text style={[styles.teamBtnText, selectedTeamId === team.id && styles.teamBtnTextSelected]}>
                  {team.abbreviation}
                </Text>
                <Text style={styles.teamCity}>{team.city}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Score prediction (optional +2 pts)</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreInput}>
              <Text style={styles.scoreLabel}>{game.awayTeam.abbreviation}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="–"
                placeholderTextColor="#6b7280"
                value={awayScore}
                onChangeText={setAwayScore}
                maxLength={3}
              />
            </View>
            <Text style={styles.scoreDash}>–</Text>
            <View style={styles.scoreInput}>
              <Text style={styles.scoreLabel}>{game.homeTeam.abbreviation}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="–"
                placeholderTextColor="#6b7280"
                value={homeScore}
                onChangeText={setHomeScore}
                maxLength={3}
              />
            </View>
          </View>

          <View style={styles.pointsGuide}>
            <Text style={styles.pointsTitle}>Points you can earn:</Text>
            <Text style={styles.pointsRow}>✓ Correct winner → 2 pts</Text>
            <Text style={styles.pointsRow}>✓ Score within ±10 → +2 pts</Text>
            <Text style={styles.pointsRow}>✓ Exact score → +5 pts</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (!selectedTeamId || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!selectedTeamId || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Lock In Prediction'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a2634',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  matchup: { fontSize: 14, color: '#9ca3af', marginBottom: 20 },
  label: { fontSize: 13, color: '#9ca3af', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  teamRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  teamBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#0f1923',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamBtnSelected: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  teamBtnText: { fontSize: 20, fontWeight: '800', color: '#9ca3af' },
  teamBtnTextSelected: { color: '#f97316' },
  teamCity: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  scoreInput: { flex: 1, alignItems: 'center' },
  scoreLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  input: {
    backgroundColor: '#0f1923',
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    borderRadius: 8,
    padding: 12,
    width: '100%',
  },
  scoreDash: { color: '#6b7280', fontSize: 24, fontWeight: '300' },
  pointsGuide: {
    backgroundColor: '#0f1923',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  pointsTitle: { color: '#9ca3af', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  pointsRow: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  saveBtn: {
    backgroundColor: '#f97316',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: { alignItems: 'center', padding: 10 },
  cancelBtnText: { color: '#6b7280', fontSize: 15 },
});
