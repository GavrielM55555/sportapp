// Shared cache in front of ESPN's public API.
// Every phone calls this instead of ESPN; Vercel's CDN caches each response,
// so ESPN sees roughly one request per URL per cache window no matter how
// many people use the app.
//
//   GET /api/espn?path=apis/site/v2/sports/basketball/nba/scoreboard&dates=20261025

const ESPN_HOST = 'https://site.api.espn.com';

// Only ESPN sports endpoints — this must not become an open proxy
const PATH_RE = /^apis\/(site\/)?v2\/sports\/[a-z-]+(\/[a-zA-Z0-9._-]+)?\/(scoreboard|standings|news|summary|teams|rankings)$/;
const ALLOWED_PARAMS = ['dates', 'limit', 'groups', 'seasontype', 'season', 'event', 'week', 'calendar'];

/** Seconds the CDN may serve a cached copy, by endpoint */
function ttlFor(path: string): number {
  if (path.endsWith('/scoreboard') || path.endsWith('/summary')) return 30;
  if (path.endsWith('/news')) return 600;
  return 3600; // standings, teams, rankings
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (!PATH_RE.test(path)) {
    return Response.json({ error: 'path not allowed' }, { status: 400, headers: CORS });
  }

  const forward = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null) forward.set(key, value);
  }
  const qs = forward.toString();
  const target = `${ESPN_HOST}/${path}${qs ? `?${qs}` : ''}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: { Accept: 'application/json' } });
  } catch {
    return Response.json({ error: 'upstream unreachable' }, { status: 502, headers: CORS });
  }
  if (!upstream.ok) {
    // Don't cache errors for long, so a hiccup at ESPN clears quickly
    return Response.json(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status, headers: { ...CORS, 'Cache-Control': 'public, s-maxage=5' } }
    );
  }

  const ttl = ttlFor(path);
  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers always revalidate; the CDN holds it for `ttl` and serves stale while refreshing
      'Cache-Control': `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`,
    },
  });
}
