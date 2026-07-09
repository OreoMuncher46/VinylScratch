/**
 * SpotifyClient — Wrapper for Spotify Web API endpoints.
 * Returns data normalized into our unified TrackItem / Playlist formats.
 */
import { getAccessToken, refreshToken } from './SpotifyAuth';
import type { TrackItem, Playlist, SpotifyProfile } from '../store/AppStore';

const BASE = 'https://api.spotify.com/v1';

async function apiFetch(path: string): Promise<Response> {
  let token = getAccessToken();
  if (!token) {
    const ok = await refreshToken();
    if (!ok) throw new Error('Spotify token expired');
    token = getAccessToken();
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const ok = await refreshToken();
    if (!ok) throw new Error('Spotify re-auth failed');
    token = getAccessToken();
    return fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  return res;
}

// ── Normalization Helpers ──

function normalizeTrack(item: any, albumArt?: string): TrackItem {
  const track = item.track ?? item;
  const art =
    albumArt ??
    track.album?.images?.[0]?.url ??
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300&auto=format&fit=crop';
  return {
    id: `sp-${track.id}`,
    title: track.name ?? 'Unknown',
    artist: track.artists?.map((a: any) => a.name).join(', ') ?? 'Unknown Artist',
    album: track.album?.name ?? '',
    duration: Math.round((track.duration_ms ?? 0) / 1000),
    albumArtUrl: art,
    spotifyId: track.id,
    source: 'spotify',
    resolved: false,
  };
}

// ── Public API ──

export async function getUserProfile(): Promise<SpotifyProfile> {
  const res = await apiFetch('/me');
  if (!res.ok) throw new Error('Failed to fetch profile');
  const data = await res.json();
  return {
    displayName: data.display_name ?? data.id,
    email: data.email ?? '',
    imageUrl: data.images?.[0]?.url,
  };
}

export async function getUserPlaylists(): Promise<Playlist[]> {
  const playlists: Playlist[] = [];
  let url = '/me/playlists?limit=50';

  while (url) {
    const res = await apiFetch(url);
    if (!res.ok) break;
    const data = await res.json();

    for (const item of data.items ?? []) {
      playlists.push({
        id: `sp-${item.id}`,
        name: item.name,
        description: item.description || undefined,
        coverUrl:
          item.images?.[0]?.url ??
          'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop',
        tracks: [], // Loaded lazily when opening playlist
        source: 'spotify',
        trackCount: item.tracks?.total ?? 0,
      });
    }

    url = data.next ? data.next.replace(BASE, '') : '';
  }

  return playlists;
}

export async function getPlaylistTracks(spotifyPlaylistId: string): Promise<TrackItem[]> {
  const rawId = spotifyPlaylistId.replace('sp-', '');
  const tracks: TrackItem[] = [];
  let url = `/playlists/${rawId}/tracks?limit=100&fields=items(track(id,name,artists,album(name,images),duration_ms)),next`;

  while (url) {
    const res = await apiFetch(url);
    if (!res.ok) break;
    const data = await res.json();

    for (const item of data.items ?? []) {
      if (!item.track || !item.track.id) continue; // Skip local/unavailable tracks
      tracks.push(normalizeTrack(item));
    }

    url = data.next ? data.next.replace(BASE, '') : '';
  }

  return tracks;
}

export async function getLikedSongs(limit = 50): Promise<TrackItem[]> {
  const res = await apiFetch(`/me/tracks?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? [])
    .filter((item: any) => item.track?.id)
    .map((item: any) => normalizeTrack(item));
}

export async function searchTracks(query: string, limit = 20): Promise<TrackItem[]> {
  const res = await apiFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tracks?.items ?? []).map((t: any) => normalizeTrack({ track: t }));
}

export async function getTopTracks(): Promise<TrackItem[]> {
  const res = await apiFetch('/me/top/tracks?limit=20&time_range=short_term');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((t: any) => normalizeTrack({ track: t }));
}
