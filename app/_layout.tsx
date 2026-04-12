import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f1923' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#0f1923' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign In', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join Group', presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
