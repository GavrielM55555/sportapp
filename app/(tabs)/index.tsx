import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SPORTS, SportId } from '../../src/sports';
import { usePreferences } from '../../src/hooks/usePreferences';
import { SportTabs } from '../../src/components/scores/SportTabs';
import { SportScores } from '../../src/components/scores/SportScores';

/** Scores: every sport, one chip each */
export default function ScoresScreen() {
  const { prefs, loaded } = usePreferences();
  const [sport, setSport] = useState<SportId>('nba');

  // Start on the user's first favourite sport
  useEffect(() => {
    if (loaded && prefs.sports.length > 0) setSport(prefs.sports[0]);
  }, [loaded]);

  return (
    <View style={styles.container}>
      <SportTabs sports={SPORTS} value={sport} onChange={setSport} />
      <SportScores sport={sport} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
});
