/**
 * SpotifyAuth — PKCE OAuth 2.0 flow for Spotify Web API.
 * No backend server required. Tokens stored in localStorage.
 */

const CLIENT_ID = 'bc125d5aa7ce4df6be05d58457004097';
const REDIRECT_URI = `${window.location.origin}/callback`;
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
].join(' ');

const TOKEN_KEY = 'vs_spotify_token';
const VERIFIER_KEY = 'vs_pkce_verifier';
const EXPIRY_KEY = 'vs_token_expiry';
const REFRESH_KEY = 'vs_refresh_token';

// ── PKCE Helpers ──

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
}

function base64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ──

export async function initiateSpotifyLogin(): Promise<void> {
  const verifier = generateRandomString(64);
  localStorage.setItem(VERIFIER_KEY, verifier);

  const challenge = base64UrlEncode(await sha256(verifier));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true',
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleSpotifyCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (error || !code) {
    console.error('Spotify auth error:', error);
    return false;
  }

  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    console.error('No PKCE verifier found');
    return false;
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: verifier,
      }),
    });

    if (!res.ok) {
      console.error('Token exchange failed:', res.status);
      return false;
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token || '');
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + data.expires_in * 1000));
    localStorage.removeItem(VERIFIER_KEY);

    // Clean URL
    window.history.replaceState({}, document.title, '/');
    return true;
  } catch (err) {
    console.error('Token exchange error:', err);
    return false;
  }
}

export async function refreshToken(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CLIENT_ID,
      }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + data.expires_in * 1000));
    return true;
  } catch {
    return false;
  }
}

export function getAccessToken(): string | null {
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (expiry && Date.now() > Number(expiry) - 60000) {
    // Token expired or about to expire — caller should refresh
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(VERIFIER_KEY);
}

export function hasCallbackParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') || params.has('error');
}
