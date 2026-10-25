import { espnJson } from './espn';
import { leagueSlug } from './apifootball';
import { SportId } from '../sports';

// ESPN unofficial public API — free, no key, CORS-friendly
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// ESPN news path per sport (football is per league, see below)
const SPORT_NEWS_PATH: Record<Exclude<SportId, 'football'>, string> = {
  nba: 'basketball/nba',
  f1: 'racing/f1',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
  ufc: 'mma/ufc',
  tennis: 'tennis/atp',
};

export interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  url: string;
  publishedAt: string;  // ISO string
  source: string;
  sport: SportId;
  leagueId?: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: NewsArticle[]; ts: number }>();
const CACHE_TTL = 10 * 60_000; // 10 minutes

function mapArticle(raw: any, sport: SportId, leagueId?: number): NewsArticle {
  return {
    id: String(raw.dataSourceIdentifier ?? raw.id ?? Math.random()),
    headline: raw.headline ?? '',
    description: raw.description ?? raw.story ?? '',
    imageUrl: raw.images?.[0]?.url ?? null,
    url: raw.links?.web?.href ?? raw.links?.mobile?.href ?? '',
    publishedAt: raw.published ?? new Date().toISOString(),
    source: raw.byline ?? 'ESPN',
    sport,
    leagueId,
  };
}

async function cached(key: string, load: () => Promise<NewsArticle[]>): Promise<NewsArticle[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await load();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

function byNewest(a: NewsArticle, b: NewsArticle): number {
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

/** Remove repeats (the same story is often filed under several leagues) */
function dedupe(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

export function getSportNews(sport: Exclude<SportId, 'football'>, limit = 20): Promise<NewsArticle[]> {
  return cached(`${sport}:${limit}`, async () => {
    const data = await espnJson(`${ESPN_BASE}/${SPORT_NEWS_PATH[sport]}/news?limit=${limit}`);
    return (data.articles ?? []).map((a: any) => mapArticle(a, sport));
  });
}

export function getFootballNews(leagueIds: number[], limit = 30): Promise<NewsArticle[]> {
  const slugs = leagueIds
    .map(id => ({ id, slug: leagueSlug(id) }))
    .filter((l): l is { id: number; slug: string } => !!l.slug);

  return cached(`football:${[...leagueIds].sort().join(',')}:${limit}`, async () => {
    if (slugs.length === 0) {
      // No leagues picked → general soccer news
      const data = await espnJson(`${ESPN_BASE}/soccer/news?limit=${limit}`);
      return (data.articles ?? []).map((a: any) => mapArticle(a, 'football'));
    }
    // Per-league in parallel (max 10 articles each)
    const results = await Promise.allSettled(
      slugs.map(({ id, slug }) =>
        espnJson(`${ESPN_BASE}/soccer/${slug}/news?limit=10`)
          .then((data: any) => (data.articles ?? []).map((a: any) => mapArticle(a, 'football', id)))
      )
    );
    return dedupe(results.flatMap(r => (r.status === 'fulfilled' ? r.value : [])))
      .sort(byNewest)
      .slice(0, limit);
  });
}

export async function getNewsForPreferences(
  sports: SportId[],
  leagueIds: number[]
): Promise<NewsArticle[]> {
  // No sports picked → a general mix of the most followed ones
  const wanted: SportId[] = sports.length > 0 ? sports : ['nba', 'football', 'f1', 'nfl'];
  const perSport = sports.length > 0 ? 20 : 10;

  // allSettled so one failing source doesn't kill the whole feed
  const results = await Promise.allSettled(
    wanted.map(s => (s === 'football' ? getFootballNews(leagueIds, perSport + 10) : getSportNews(s, perSport)))
  );
  const articles = dedupe(results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))).sort(byNewest);

  if (articles.length === 0) throw new Error('No news available');
  return articles;
}
