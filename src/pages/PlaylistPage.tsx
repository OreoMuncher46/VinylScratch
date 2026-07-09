import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, Disc } from 'lucide-react';
import { useAppState, TrackItem } from '../store/AppStore';
import * as SpotifyClient from '../api/SpotifyClient';

interface PlaylistPageProps {
  playlistId: string;
}

export const PlaylistPage: React.FC<PlaylistPageProps> = ({ playlistId }) => {
  const { state, dispatch } = useAppState();
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const playlist = state.playlists.find(p => p.id === playlistId);

  useEffect(() => {
    if (!playlist) return;

    // If local playlist, tracks are already in state
    if (playlist.source === 'local') {
      setTracks(playlist.tracks);
      return;
    }

    // If Spotify playlist, check if tracks are cached locally first
    if (playlist.tracks.length > 0) {
      setTracks(playlist.tracks);
      return;
    }

    // Otherwise fetch tracks from Spotify
    async function loadSpotifyTracks() {
      setLoadingTracks(true);
      try {
        const fetched = await SpotifyClient.getPlaylistTracks(playlistId);
        setTracks(fetched);

        // Cache them back in the state store so we don't refetch on back navigation
        const updatedPlaylists = state.playlists.map(p =>
          p.id === playlistId ? { ...p, tracks: fetched } : p
        );
        dispatch({ type: 'SET_PLAYLISTS', playlists: updatedPlaylists });
      } catch (err) {
        console.error('Failed to load playlist tracks:', err);
      } finally {
        setLoadingTracks(false);
      }
    }

    loadSpotifyTracks();
  }, [playlistId, playlist, dispatch, state.playlists]);

  const handleBack = () => {
    dispatch({ type: 'NAVIGATE', route: { page: 'home' } });
  };

  const handlePlayTrack = (index: number) => {
    dispatch({ type: 'SET_QUEUE', tracks, startIndex: index });
    dispatch({ type: 'SET_PLAYING', playing: true });
    dispatch({ type: 'EXPAND_NOW_PLAYING' });
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    handlePlayTrack(0);
  };

  if (!playlist) {
    return (
      <div className="playlist-page">
        <header className="page-header">
          <button className="icon-btn" onClick={handleBack}>
            <ArrowLeft size={22} />
          </button>
          <h2 className="page-header__title">Playlist Not Found</h2>
        </header>
      </div>
    );
  }

  return (
    <div className="playlist-page">
      {/* Blurred Album Art Background */}
      <div
        className="playlist-page__bg"
        style={{ backgroundImage: `url(${playlist.coverUrl})` }}
      />

      <header className="playlist-page__header">
        <button className="icon-btn" onClick={handleBack}>
          <ArrowLeft size={22} />
        </button>
      </header>

      {/* Hero Header */}
      <div className="playlist-hero">
        <img src={playlist.coverUrl} alt="" className="playlist-hero__art" draggable={false} />
        <div className="playlist-hero__details">
          <h2 className="playlist-hero__title">{playlist.name}</h2>
          <p className="playlist-hero__desc">
            {playlist.description || `${playlist.trackCount} Tracks from ${playlist.source}`}
          </p>
          {tracks.length > 0 && (
            <button className="play-all-btn" onClick={handlePlayAll}>
              <Play size={16} fill="currentColor" /> Play All
            </button>
          )}
        </div>
      </div>

      {/* Tracks list */}
      <div className="playlist-tracks">
        {loadingTracks ? (
          <div className="loading-state">
            <Disc size={36} className="loading-spinner" />
            <p className="loading-text">Loading playlist tracks...</p>
          </div>
        ) : tracks.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__text">No songs in this playlist.</p>
          </div>
        ) : (
          <div className="track-table">
            {tracks.map((track, idx) => (
              <div key={track.id} className="track-row" onClick={() => handlePlayTrack(idx)}>
                <span className="track-row__number">{idx + 1}</span>
                <img src={track.albumArtUrl} alt="" className="track-row__art" draggable={false} />
                <div className="track-row__info">
                  <div className="track-row__title">{track.title}</div>
                  <div className="track-row__artist">{track.artist}</div>
                </div>
                <span className="track-row__duration">
                  {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
