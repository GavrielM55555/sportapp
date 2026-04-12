import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { usePreferences } from '../../src/hooks/usePreferences';
import { getNewsForPreferences, NewsArticle } from '../../src/api/espnnews';

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsCard({ article }: { article: NewsArticle }) {
  const handlePress = () => {
    if (article.url) Linking.openURL(article.url);
  };
  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.8}>
      {article.imageUrl && (
        <Image source={{ uri: article.imageUrl }} style={styles.cardImage} />
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardMeta}>
          <Text style={styles.cardSport}>
            {article.sport === 'nba' ? '🏀 NBA' : '⚽ Football'}
          </Text>
          <Text style={styles.cardTime}>{timeAgo(article.publishedAt)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={3}>{article.headline}</Text>
        {article.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{article.description}</Text>
        ) : null}
        <Text style={styles.cardSource}>{article.source}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NewsScreen() {
  const { prefs, loaded } = usePreferences();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) setLoading(true);
    try {
      const data = await getNewsForPreferences(prefs.sports, prefs.leagueIds);
      setArticles(data);
    } catch (e: any) {
      setError('Failed to load news. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [prefs.sports, prefs.leagueIds]);

  useEffect(() => {
    if (loaded) load();
  }, [loaded, prefs.sports, prefs.leagueIds]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {prefs.sports.length === 0 && (
        <View style={styles.prefBanner}>
          <Text style={styles.prefBannerText}>
            Showing general sports news · Go to For You tab to pick your leagues
          </Text>
        </View>
      )}
      <FlatList
        data={articles}
        keyExtractor={a => a.id}
        renderItem={({ item }) => <NewsCard article={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor="#f97316"
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyEmoji}>📰</Text>
            <Text style={styles.emptyText}>No news available right now</Text>
            <Text style={styles.emptySub}>Pull down to refresh</Text>
          </View>
        }
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  prefBanner: {
    backgroundColor: '#1a2634', paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e2d3d',
  },
  prefBannerText: { color: '#6b7280', fontSize: 12, textAlign: 'center' },

  card: { backgroundColor: '#1a2634', marginHorizontal: 12, marginVertical: 4, borderRadius: 14, overflow: 'hidden' },
  cardImage: { width: '100%', height: 180, resizeMode: 'cover' },
  cardBody: { padding: 14 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardSport: { fontSize: 12, fontWeight: '700', color: '#f97316' },
  cardTime: { fontSize: 12, color: '#6b7280' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', lineHeight: 22, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#9ca3af', lineHeight: 19, marginBottom: 8 },
  cardSource: { fontSize: 11, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  separator: { height: 1, backgroundColor: '#0f1923' },

  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySub: { color: '#6b7280', fontSize: 13 },
  errorText: { color: '#9ca3af', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
});
