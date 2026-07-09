import React, { useEffect } from 'react';
import { AppProvider, useAppState } from './store/AppStore';
import { handleSpotifyCallback, hasCallbackParams, isLoggedIn } from './api/SpotifyAuth';
import * as SpotifyClient from './api/SpotifyClient';
import { MiniPlayer } from './components/MiniPlayer';
import { NowPlaying } from './components/NowPlaying';
import { HomePage } from './pages/HomePage';
import { PlaylistPage } from './pages/PlaylistPage';
import { SettingsPage } from './pages/SettingsPage';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppState();

  // Handle Spotify Callback Redirect and Boot Authentication status
  useEffect(() => {
    async function bootAuth() {
      // 1. Check if we are returning from Spotify authorize redirect
      if (hasCallbackParams()) {
        dispatch({ type: 'SPOTIFY_LOADING', loading: true });
        const success = await handleSpotifyCallback();
        if (success) {
          dispatch({ type: 'SPOTIFY_LOADING', loading: false });
          // Logged in successfully
          dispatch({ type: 'SPOTIFY_LOGIN', profile: { displayName: 'Spotify User', email: '' } });
          loadSpotifyData();
        } else {
          dispatch({ type: 'SPOTIFY_LOADING', loading: false });
        }
        return;
      }

      // 2. Check if already logged in on reload
      if (isLoggedIn()) {
        dispatch({ type: 'SPOTIFY_LOGIN', profile: { displayName: 'Spotify User', email: '' } });
        loadSpotifyData();
      }
    }

    async function loadSpotifyData() {
      try {
        const playlists = await SpotifyClient.getUserPlaylists();
        // Load Liked Songs as a special playlist
        const likedTracks = await SpotifyClient.getLikedSongs(100);
        const likedPlaylist = {
          id: 'spotify-liked',
          name: 'Liked Songs',
          description: 'Your favorite tracks from Spotify',
          coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300&auto=format&fit=crop',
          tracks: likedTracks,
          source: 'spotify' as const,
          trackCount: likedTracks.length,
        };

        dispatch({ type: 'SET_PLAYLISTS', playlists: [likedPlaylist, ...playlists] });
      } catch (err) {
        console.error('Failed to load Spotify libraries:', err);
      }
    }

    bootAuth();
  }, [dispatch]);

  // Page Routing resolver
  const renderPage = () => {
    switch (state.route.page) {
      case 'home':
        return <HomePage />;
      case 'settings':
        return <SettingsPage />;
      case 'playlist':
        return <PlaylistPage playlistId={state.route.playlistId} />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="app-shell">
      {/* Background Ambient Glows */}
      <div className="glow-orb glow-orb--primary" />
      <div className="glow-orb glow-orb--secondary" />

      {/* Main Content Area */}
      <div className="main-content">
        {renderPage()}
      </div>

      {/* Persistent Mini Player at bottom */}
      <MiniPlayer />

      {/* Full-screen Now Playing Overlay */}
      <NowPlaying />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
