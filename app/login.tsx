import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthContext } from '../src/context/AuthContext';

export default function LoginScreen() {
  const { user, signInWithGoogle } = useAuthContext();

  // If user is already signed in (e.g. after redirect), go back
  useEffect(() => {
    if (user) router.replace('/(tabs)/groups');
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      router.replace('/(tabs)/groups'); // for popup flow (mobile)
    } catch (e) {
      console.error('Login error', e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🏀</Text>
      <Text style={styles.title}>SportApp</Text>
      <Text style={styles.subtitle}>
        Sign in to create groups, predict games, and compete with friends.
      </Text>

      <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLogin}>
        <Text style={styles.googleBtnText}>Continue with Google</Text>
      </TouchableOpacity>
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
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
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
});
