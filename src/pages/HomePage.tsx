import React, { useEffect, useState } from 'react';
import { Settings, Folder, ListMusic, Disc, Search } from 'lucide-react';
import { useAppState, Playlist, TrackItem } from '../store/AppStore';
import { scanLocalDirectory } from '../api/LocalFiles';
import * as SpotifyClient from '../api/SpotifyClient';

export const HomePage: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { playlists, spotifyLoggedIn } = state;
  const [recommendations, setRecommendations] = useState<TrackItem[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Load Spotify-powered recommendations if logged in
  useEffect(() => {
    async function loadRecs() {
      if (!spotifyLoggedIn) {
        // Mock default premium lofi/synth recommendations
        setRecommendations([
          {
            id: 'rec-1',
            title: 'Neon Horizon',
            artist: 'VinylScratch Synth Engine',
            album: 'Zero-Latency Beats Vol. 1',
            duration: 8,
            albumArtUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop',
            accentColor: '#ec4899',
            source: 'spotify',
            spotifyId: 'synth-loop'
          },
          {
            id: 'rec-2',
            title: 'Midnight Drive',
            artist: 'ChillHop Collective',
            album: 'Coffee Shop Beats',
            duration: 165,
            albumArtUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300&auto=format&fit=crop',
            audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            source: 'local',
          },
          {
            id: 'rec-3',
            title: 'Groove Station',
            artist: 'The Funk Express',
            album: 'Vinyl Classics',
            duration: 502,
            albumArtUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?q=80&w=300&auto=format&fit=crop',
            audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
            source: 'local',
          }
        ]);
        return;
      }
      setLoadingRecs(true);
      try {
        const topTracks = await SpotifyClient.getTopTracks();
        if (topTracks.length > 0) {
          setRecommendations(topTracks);
        }
      } catch (err) {
        console.error('Failed to load Spotify recommendations:', err);
      } finally {
        setLoadingRecs(false);
      }
    }
    loadRecs();
  }, [spotifyLoggedIn]);

  const handleScanLocal = async () => {
    const playlist = await scanLocalDirectory();
    if (playlist) {
      dispatch({ type: 'SET_LOCAL_FILES_GRANTED', granted: true });
      dispatch({ type: 'ADD_PLAYLIST', playlist });
    }
  };

  const handleOpenPlaylist = (id: string) => {
    dispatch({ type: 'NAVIGATE', route: { page: 'playlist', playlistId: id } });
  };

  const handleOpenSettings = () => {
    dispatch({ type: 'NAVIGATE', route: { page: 'settings' } });
  };

  const handlePlayTrack = (track: TrackItem) => {
    dispatch({ type: 'SET_QUEUE', tracks: [track], startIndex: 0 });
    dispatch({ type: 'SET_PLAYING', playing: true });
  };

  return (
    <div className="home-page">
      {/* Top Header */}
      <header className="page-header">
        <div className="page-header__brand">
          <Disc size={28} className="page-header__icon text-accent" />
          <h1 className="page-header__title">VinylScratch</h1>
        </div>
        <button className="icon-btn" onClick={handleOpenSettings}>
          <Settings size={22} />
        </button>
      </header>

      {/* Recommended Section */}
      <section className="section">
        <h2 className="section__title">Recommended for You</h2>
        {loadingRecs ? (
          <div className="loading-shimmer" style={{ height: '80px', borderRadius: '12px' }} />
        ) : (
          <div className="rec-grid">
            {recommendations.map(track => (
              <div key={track.id} className="rec-card" onClick={() => handlePlayTrack(track)}>
                <img src={track.albumArtUrl} alt="" className="rec-card__art" draggable={false} />
                <div className="rec-card__info">
                  <div className="rec-card__title">{track.title}</div>
                  <div className="rec-card__artist">{track.artist}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Local Files Banner */}
      {!state.localFilesGranted && (
        <section className="section">
          <div className="banner" onClick={handleScanLocal}>
            <Folder size={24} className="banner__icon" />
            <div className="banner__content">
              <h3 className="banner__title">Access Device Storage</h3>
              <p className="banner__text">Select a directory containing your local audio files to import.</p>
            </div>
          </div>
        </section>
      )}

      {/* Playlists Grid */}
      <section className="section">
        <h2 className="section__title">Playlists</h2>
        {playlists.length === 0 ? (
          <div className="empty-state">
            <ListMusic size={36} className="empty-state__icon" />
            <p className="empty-state__text">No playlists loaded yet. Import local files or connect your Spotify account in Settings.</p>
          </div>
        ) : (
          <div className="playlist-grid">
            {playlists.map(pl => (
              <div key={pl.id} className="playlist-card" onClick={() => handleOpenPlaylist(pl.id)}>
                <div className="playlist-card__art-wrapper">
                  <img src={pl.coverUrl} alt="" className="playlist-card__art" draggable={false} />
                  <div className="playlist-card__badge">{pl.source.toUpperCase()}</div>
                </div>
                <div className="playlist-card__title">{pl.name}</div>
                <div className="playlist-card__subtitle">{pl.trackCount} Tracks</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
