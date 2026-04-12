import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthContext } from '../context/AuthContext';
import { PlayoffSeries, SeriesPrediction } from '../types';

interface Props {
  series: PlayoffSeries;
  groupId?: string;
  onClose: () => void;
}

const GAME_OPTIONS = [4, 5, 6, 7] as const;

export function PredictSeriesModal({ series, groupId, onClose }: Props) {
  const { user } = useAuthContext();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedGames, setSelectedGames] = useState<4 | 5 | 6 | 7 | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !selectedTeamId || !selectedGames) return;
    if (!groupId) {
      Alert.alert('Join a group first', 'You need to be in a group to make predictions.');
      onClose();
      return;
    }

    setSaving(true);
    try {
      const prediction: Omit<SeriesPrediction, 'id'> = {
        uid: user.uid,
        groupId,
        seriesId: series.id,
        predictedWinnerTeamId: selectedTeamId,
        predictedGames: selectedGames,
        submittedAt: Date.now(),
      };

      const q = query(
        collection(db, 'series_predictions'),
        where('uid', '==', user.uid),
        where('groupId', '==', groupId),
        where('seriesId', '==', series.id)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, 'series_predictions', existing.docs[0].id), prediction as any);
      } else {
        await addDoc(collection(db, 'series_predictions'), prediction);
      }
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Failed to save prediction.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!selectedTeamId && !!selectedGames && !saving;
  const selectedTeamAbbr = selectedTeamId
    ? (selectedTeamId === series.homeTeam.id ? series.homeTeam.abbreviation : series.awayTeam.abbreviation)
    : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView>
          <View style={styles.sheet}>
            <Text style={styles.title}>Predict the Series</Text>
            <Text style={styles.matchup}>
              {series.awayTeam.abbreviation} vs {series.homeTeam.abbreviation}
            </Text>

            {/* Winner pick */}
            <Text style={styles.label}>Who wins the series?</Text>
            <View style={styles.teamRow}>
              {[series.awayTeam, series.homeTeam].map((team) => (
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

            {/* Games pick */}
            <Text style={styles.label}>In how many games?</Text>
            <View style={styles.gamesRow}>
              {GAME_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.gameBtn, selectedGames === n && styles.gameBtnSelected]}
                  onPress={() => setSelectedGames(n)}
                >
                  <Text style={[styles.gameBtnText, selectedGames === n && styles.gameBtnTextSelected]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Preview */}
            {selectedTeamAbbr && selectedGames && (
              <View style={styles.preview}>
                <Text style={styles.previewText}>
                  Your pick: <Text style={styles.previewHighlight}>{selectedTeamAbbr} in {selectedGames}</Text>
                </Text>
              </View>
            )}

            {/* Points guide */}
            <View style={styles.pointsGuide}>
              <Text style={styles.pointsTitle}>Points you can earn:</Text>
              <Text style={styles.pointsRow}>✓ Correct series winner → 5 pts</Text>
              <Text style={styles.pointsRow}>✓ Correct number of games → +3 pts</Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Lock In Series Pick'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  gamesRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  gameBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#0f1923',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gameBtnSelected: { borderColor: '#f97316', backgroundColor: '#1f1200' },
  gameBtnText: { fontSize: 18, fontWeight: '800', color: '#9ca3af' },
  gameBtnTextSelected: { color: '#f97316' },
  preview: {
    backgroundColor: '#0f1923',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  previewText: { color: '#9ca3af', fontSize: 15 },
  previewHighlight: { color: '#f97316', fontWeight: '800' },
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
