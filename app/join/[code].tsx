import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthContext } from '../../src/context/AuthContext';
import { useGroups } from '../../src/hooks/useGroups';

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, loading: authLoading } = useAuthContext();
  const { joinGroupByCode } = useGroups();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Store code in URL and send to login, then come back
      router.replace(`/login`);
      return;
    }

    async function join() {
      try {
        const groupId = await joinGroupByCode(code!);
        if (groupId) router.replace(`/group/${groupId}`);
        else router.replace('/(tabs)/groups');
      } catch {
        router.replace('/(tabs)/groups');
      }
    }

    join();
  }, [user, authLoading, code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#f97316" />
      <Text style={styles.text}>Joining group...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923', alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { color: '#9ca3af', fontSize: 16 },
});
