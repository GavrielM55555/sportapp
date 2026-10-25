// All ESPN requests go through our shared cache (api/espn.ts on Vercel), so the
// number of calls ESPN sees doesn't grow with the number of users. If the cache
// is unreachable we fall back to calling ESPN directly.

const ESPN_HOST = 'https://site.api.espn.com/';
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://sportapp-chi.vercel.app';

function proxyUrl(espnUrl: string): string {
  // Manual split — React Native's URL polyfill lacks searchParams
  const [base, qs] = espnUrl.split('?');
  const path = base.slice(ESPN_HOST.length);
  return `${API_BASE}/api/espn?path=${encodeURIComponent(path)}${qs ? `&${qs}` : ''}`;
}

/** Fetch JSON from a full ESPN URL (https://site.api.espn.com/...) via the shared cache */
export async function espnJson<T = any>(espnUrl: string): Promise<T> {
  if (espnUrl.startsWith(ESPN_HOST)) {
    try {
      const res = await fetch(proxyUrl(espnUrl));
      if (res.ok) return (await res.json()) as T;
    } catch {
      // fall through to direct
    }
  }
  const res = await fetch(espnUrl);
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${espnUrl}`);
  return (await res.json()) as T;
}
