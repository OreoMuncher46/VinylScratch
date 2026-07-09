/**
 * AppStore — Global state management via React Context + useReducer.
 * Manages routing, playlists, playback queue, settings, and now-playing panel state.
 */
import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// ── Data Types ──

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  albumArtUrl: string;
  audioUrl?: string;        // Direct playable URL (local blob or resolved stream)
  spotifyId?: string;       // Spotify track ID for stream resolution
  source: 'local' | 'spotify';
  accentColor?: string;
  resolved?: boolean;       // Whether stream URL has been resolved
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl: string;
  tracks: TrackItem[];
  source: 'local' | 'spotify';
  trackCount: number;
}

export interface SpotifyProfile {
  displayName: string;
  email: string;
  imageUrl?: string;
}

export type Route = 
  | { page: 'home' }
  | { page: 'settings' }
  | { page: 'playlist'; playlistId: string };

export type StreamQuality = 'low' | 'medium' | 'high';

// ── State ──

export interface AppState {
  route: Route;
  playlists: Playlist[];
  queue: TrackItem[];
  queueIndex: number;
  isPlaying: boolean;
  nowPlayingExpanded: boolean;
  spotifyLoggedIn: boolean;
  spotifyProfile: SpotifyProfile | null;
  spotifyLoading: boolean;
  streamQuality: StreamQuality;
  localFilesGranted: boolean;
  loading: boolean;
}

const initialState: AppState = {
  route: { page: 'home' },
  playlists: [],
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  nowPlayingExpanded: false,
  spotifyLoggedIn: false,
  spotifyProfile: null,
  spotifyLoading: false,
  streamQuality: 'high',
  localFilesGranted: false,
  loading: false,
};

// ── Actions ──

export type AppAction =
  | { type: 'NAVIGATE'; route: Route }
  | { type: 'SET_PLAYLISTS'; playlists: Playlist[] }
  | { type: 'ADD_PLAYLIST'; playlist: Playlist }
  | { type: 'SET_QUEUE'; tracks: TrackItem[]; startIndex: number }
  | { type: 'SET_QUEUE_INDEX'; index: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'TOGGLE_NOW_PLAYING' }
  | { type: 'EXPAND_NOW_PLAYING' }
  | { type: 'COLLAPSE_NOW_PLAYING' }
  | { type: 'SPOTIFY_LOGIN'; profile: SpotifyProfile }
  | { type: 'SPOTIFY_LOGOUT' }
  | { type: 'SPOTIFY_LOADING'; loading: boolean }
  | { type: 'SET_STREAM_QUALITY'; quality: StreamQuality }
  | { type: 'SET_LOCAL_FILES_GRANTED'; granted: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'UPDATE_TRACK_URL'; trackId: string; audioUrl: string };

// ── Reducer ──

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, route: action.route };
    case 'SET_PLAYLISTS':
      return { ...state, playlists: action.playlists };
    case 'ADD_PLAYLIST':
      return { ...state, playlists: [...state.playlists, action.playlist] };
    case 'SET_QUEUE':
      return { ...state, queue: action.tracks, queueIndex: action.startIndex };
    case 'SET_QUEUE_INDEX':
      return { ...state, queueIndex: action.index };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };
    case 'TOGGLE_NOW_PLAYING':
      return { ...state, nowPlayingExpanded: !state.nowPlayingExpanded };
    case 'EXPAND_NOW_PLAYING':
      return { ...state, nowPlayingExpanded: true };
    case 'COLLAPSE_NOW_PLAYING':
      return { ...state, nowPlayingExpanded: false };
    case 'SPOTIFY_LOGIN':
      return { ...state, spotifyLoggedIn: true, spotifyProfile: action.profile };
    case 'SPOTIFY_LOGOUT':
      return {
        ...state,
        spotifyLoggedIn: false,
        spotifyProfile: null,
        playlists: state.playlists.filter(p => p.source !== 'spotify'),
      };
    case 'SPOTIFY_LOADING':
      return { ...state, spotifyLoading: action.loading };
    case 'SET_STREAM_QUALITY':
      return { ...state, streamQuality: action.quality };
    case 'SET_LOCAL_FILES_GRANTED':
      return { ...state, localFilesGranted: action.granted };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'UPDATE_TRACK_URL': {
      const queue = state.queue.map(t =>
        t.id === action.trackId ? { ...t, audioUrl: action.audioUrl, resolved: true } : t
      );
      return { ...state, queue };
    }
    default:
      return state;
  }
}

// ── Context ──

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
