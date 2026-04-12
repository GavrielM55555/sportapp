// ESPN unofficial public API — free, no key, CORS-friendly
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Maps our api-football league IDs → ESPN soccer league slugs
const LEAGUE_ESPN_SLUG: Record<number, string> = {
  39:  'eng.1',          // Premier League
  140: 'esp.1',          // La Liga
  78:  'ger.1',          // Bundesliga
  135: 'ita.1',          // Serie A
  61:  'fra.1',          // Ligue 1
  2:   'UEFA.CHAMPIONS', // Champions League
  1:   'FIFA.WORLD',     // World Cup
};

export interface NewsArticle {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  url: string;
  publishedAt: string;  // ISO string
  source: string;
  sport: 'nba' | 'football';
  leagueId?: number;
}

// ── Cache ─────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: NewsArticle[]; ts: number }>();
const CACHE_TTL = 10 * 60_000; // 10 minutes

function mapArticle(raw: any, sport: 'nba' | 'football', leagueId?: number): NewsArticle {
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

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN news ${res.status}`);
  return res.json();
}

export async function getNbaNews(limit = 20): Promise<NewsArticle[]> {
  const key = `nba:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const data = await fetchJson(`${ESPN_BASE}/basketball/nba/news?limit=${limit}`);
  const articles = (data.articles ?? []).map((a: any) => mapArticle(a, 'nba'));
  cache.set(key, { data: articles, ts: Date.now() });
  return articles;
}

export async function getFootballNews(leagueIds: number[], limit = 30): Promise<NewsArticle[]> {
  const key = `football:${leagueIds.sort().join(',')}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const slugs = leagueIds
    .map(id => ({ id, slug: LEAGUE_ESPN_SLUG[id] }))
    .filter(l => l.slug);

  let articles: NewsArticle[];

  if (slugs.length === 0) {
    // No known ESPN slug → fall back to general soccer news
    const data = await fetchJson(`${ESPN_BASE}/soccer/news?limit=${limit}`);
    articles = (data.articles ?? []).map((a: any) => mapArticle(a, 'football'));
  } else {
    // Fetch per-league in parallel (max 10 articles each)
    const results = await Promise.allSettled(
      slugs.map(({ id, slug }) =>
        fetchJson(`${ESPN_BASE}/soccer/${slug}/news?limit=10`)
          .then((data: any) =>
            (data.articles ?? []).map((a: any) => mapArticle(a, 'football', id))
          )
      )
    );

    // Flatten fulfilled results, deduplicate by id, sort newest first
    const seen = new Set<string>();
    articles = results
      .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      .filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit);
  }

  cache.set(key, { data: articles, ts: Date.now() });
  return articles;
}

export async function getNewsForPreferences(
  sports: ('nba' | 'football')[],
  leagueIds: number[]
): Promise<NewsArticle[]> {
  const fetches: Promise<NewsArticle[]>[] =
    sports.length === 0
      ? [getNbaNews(15), getFootballNews([], 15)]  // no prefs → general mix
      : [
          ...(sports.includes('nba') ? [getNbaNews(20)] : []),
          ...(sports.includes('football') ? [getFootballNews(leagueIds, 30)] : []),
        ];

  // Use allSettled so one failing source doesn't kill the whole feed
  const results = await Promise.allSettled(fetches);
  const articles = results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (articles.length === 0) throw new Error('No news available');
  return articles;
}
