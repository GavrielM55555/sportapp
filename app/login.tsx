import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuthContext } from '../src/context/AuthContext';

export default function LoginScreen() {
  const { user, signInWithGoogle } = useAuthContext();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace('/(tabs)/groups');
  }, [user]);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/(tabs)/groups');
    } catch (e: any) {
      console.error('Login error', e);
      setError(e?.message ?? 'Sign in failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🏀</Text>
      <Text style={styles.title}>SportApp</Text>
      <Text style={styles.subtitle}>
        Sign in to create groups, predict games, and compete with friends.
      </Text>

      <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLogin} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.googleBtnText}>Continue with Google</Text>}
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: {
    fontSize: 16, color: '#9ca3af', textAlign: 'center', marginBottom: 48, lineHeight: 24,
  },
  googleBtn: {
    backgroundColor: '#f97316',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  googleBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorText: { color: '#ef4444', marginTop: 16, textAlign: 'center', fontSize: 13 },
});
