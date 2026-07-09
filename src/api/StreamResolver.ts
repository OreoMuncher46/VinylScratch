/**
 * StreamResolver — Resolves Spotify track metadata to playable audio stream URLs
 * using the Piped API (YouTube Music proxy, CORS-friendly).
 *
 * Strategy: search YT Music via Piped → fuzzy match title+artist+duration → extract audio stream.
 * Caches resolved URLs in localStorage for instant replay.
 */

import type { TrackItem, StreamQuality } from '../store/AppStore';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
];

const CACHE_KEY = 'vs_stream_cache';
let activeInstance = 0;

function getCache(): Record<string, { url: string; ts: number }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setCache(trackId: string, url: string): void {
  const cache = getCache();
  cache[trackId] = { url, ts: Date.now() };
  // Prune cache to max 500 entries
  const keys = Object.keys(cache);
  if (keys.length > 500) {
    const sorted = keys.sort((a, b) => cache[a].ts - cache[b].ts);
    for (let i = 0; i < keys.length - 400; i++) {
      delete cache[sorted[i]];
    }
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function getCachedUrl(trackId: string): string | null {
  const cache = getCache();
  const entry = cache[trackId];
  // Cache valid for 6 hours (Piped stream URLs expire)
  if (entry && Date.now() - entry.ts < 6 * 60 * 60 * 1000) {
    return entry.url;
  }
  return null;
}

// ── Fuzzy Matching ──

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\(\)\[\]\-–—]/g, ' ')
    .replace(/feat\.?|ft\.?|featuring/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.length === 0) return 1;
  // Simple inclusion-based score
  if (longer.includes(shorter)) return shorter.length / longer.length;
  // Word overlap
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  let overlap = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++; });
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function qualityToBitrate(q: StreamQuality): number {
  switch (q) {
    case 'low': return 128000;
    case 'medium': return 256000;
    case 'high': return 320000;
  }
}

// ── Public API ──

export async function resolveStreamUrl(
  track: TrackItem,
  quality: StreamQuality = 'high'
): Promise<string> {
  // Check cache first
  const cached = getCachedUrl(track.id);
  if (cached) return cached;

  // Local files already have a URL
  if (track.source === 'local' && track.audioUrl) return track.audioUrl;

  const query = `${track.title} ${track.artist}`;

  // Try each Piped instance
  for (let attempt = 0; attempt < PIPED_INSTANCES.length; attempt++) {
    const instance = PIPED_INSTANCES[(activeInstance + attempt) % PIPED_INSTANCES.length];

    try {
      // Search for the track
      const searchRes = await fetch(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!searchRes.ok) continue;

      const searchData = await searchRes.json();
      const items = searchData.items ?? [];

      // Find best match using fuzzy matching
      let bestMatch: any = null;
      let bestScore = 0;

      for (const item of items.slice(0, 10)) {
        if (item.type !== 'stream') continue;

        const titleScore = similarity(track.title, item.title ?? '');
        const artistScore = similarity(track.artist, item.uploaderName ?? '');
        const durationDiff = Math.abs((item.duration ?? 0) - track.duration);
        const durationScore = durationDiff < 5 ? 1 : durationDiff < 15 ? 0.5 : 0.1;

        const score = titleScore * 0.4 + artistScore * 0.3 + durationScore * 0.3;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      if (!bestMatch || bestScore < 0.3) continue;

      // Get stream URL from the matched video
      const videoId = bestMatch.url?.replace('/watch?v=', '') ?? '';
      if (!videoId) continue;

      const streamRes = await fetch(
        `${instance}/streams/${videoId}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!streamRes.ok) continue;

      const streamData = await streamRes.json();
      const audioStreams = (streamData.audioStreams ?? [])
        .filter((s: any) => s.mimeType?.startsWith('audio/'))
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

      if (audioStreams.length === 0) continue;

      // Select stream closest to desired quality
      const targetBitrate = qualityToBitrate(quality);
      let bestStream = audioStreams[0];
      let bestDelta = Infinity;
      for (const s of audioStreams) {
        const delta = Math.abs((s.bitrate ?? 0) - targetBitrate);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestStream = s;
        }
      }

      const url = bestStream.url;
      if (url) {
        setCache(track.id, url);
        activeInstance = (activeInstance + attempt) % PIPED_INSTANCES.length;
        return url;
      }
    } catch (err) {
      console.warn(`Piped instance ${instance} failed:`, err);
      continue;
    }
  }

  throw new Error(`Could not resolve stream for "${track.title}" by ${track.artist}`);
}

export function clearStreamCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
