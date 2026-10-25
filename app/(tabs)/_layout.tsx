import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0f1923', borderTopColor: '#1e2d3d', height: 56 },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
        headerStyle: { backgroundColor: '#0f1923' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="foryou"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scores',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Predict',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color, size }) => <Ionicons name="newspaper" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
      {/* Retired from the tab bar: the playoff bracket moves into Predict */}
      <Tabs.Screen name="playoffs" options={{ href: null }} />
      <Tabs.Screen name="football" options={{ href: null }} />
    </Tabs>
  );
}
