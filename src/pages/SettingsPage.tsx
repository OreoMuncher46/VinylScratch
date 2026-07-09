import React, { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Check, Disc, Shield } from 'lucide-react';
import { useAppState, StreamQuality } from '../store/AppStore';
import { initiateSpotifyLogin, logout, isLoggedIn } from '../api/SpotifyAuth';
import * as SpotifyClient from '../api/SpotifyClient';

export const SettingsPage: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (state.spotifyLoggedIn) {
      setLoadingProfile(true);
      SpotifyClient.getUserProfile()
        .then(prof => {
          setProfile(prof);
          dispatch({ type: 'SPOTIFY_LOGIN', profile: prof });
        })
        .catch(err => {
          console.error('Failed to get Spotify profile:', err);
          // Token expired or invalid
          logout();
          dispatch({ type: 'SPOTIFY_LOGOUT' });
        })
        .finally(() => {
          setLoadingProfile(false);
        });
    }
  }, [state.spotifyLoggedIn, dispatch]);

  const handleBack = () => {
    dispatch({ type: 'NAVIGATE', route: { page: 'home' } });
  };

  const handleSpotifyAction = () => {
    if (state.spotifyLoggedIn) {
      logout();
      dispatch({ type: 'SPOTIFY_LOGOUT' });
      setProfile(null);
    } else {
      initiateSpotifyLogin();
    }
  };

  const handleSetQuality = (q: StreamQuality) => {
    dispatch({ type: 'SET_STREAM_QUALITY', quality: q });
  };

  return (
    <div className="settings-page">
      <header className="page-header">
        <button className="icon-btn" onClick={handleBack}>
          <ArrowLeft size={22} />
        </button>
        <h2 className="page-header__title">Settings</h2>
      </header>

      <div className="settings-content">
        {/* Spotify Login Card */}
        <section className="settings-card">
          <h3 className="settings-card__title">Integrations</h3>

          {loadingProfile ? (
            <div className="loading-shimmer" style={{ height: '70px', borderRadius: '12px' }} />
          ) : profile ? (
            <div className="spotify-profile-card">
              <img
                src={profile.imageUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop'}
                alt=""
                className="spotify-profile-card__avatar"
              />
              <div className="spotify-profile-card__info">
                <div className="spotify-profile-card__name">{profile.displayName}</div>
                <div className="spotify-profile-card__email">{profile.email}</div>
              </div>
              <button className="logout-btn" onClick={handleSpotifyAction}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <div className="login-prompt">
              <p className="login-prompt__text">Connect your Spotify account to import playlists, liked songs, and recommendations.</p>
              <button className="spotify-login-btn" onClick={handleSpotifyAction}>
                Connect Spotify
              </button>
            </div>
          )}
        </section>

        {/* Streaming Quality */}
        <section className="settings-card">
          <h3 className="settings-card__title">Streaming Quality</h3>
          <p className="settings-card__desc">Choose the audio resolution for YouTube Music streams.</p>
          <div className="quality-options">
            {(['low', 'medium', 'high'] as StreamQuality[]).map(q => {
              const active = state.streamQuality === q;
              return (
                <button
                  key={q}
                  className={`quality-option-btn ${active ? 'quality-option-btn--active' : ''}`}
                  onClick={() => handleSetQuality(q)}
                >
                  <div className="quality-option-btn__label">
                    {q.toUpperCase()}
                    <span className="quality-option-btn__detail">
                      {q === 'low' ? ' (128kbps AAC)' : q === 'medium' ? ' (256kbps AAC)' : ' (320kbps Opus/AAC)'}
                    </span>
                  </div>
                  {active && <Check size={16} className="text-accent" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Security / local permissions banner */}
        <section className="settings-card">
          <div className="security-info">
            <Shield size={20} className="security-info__icon" />
            <div className="security-info__content">
              <h4 className="security-info__title">Privacy & Security</h4>
              <p className="security-info__text">
                VinylScratch acts as a local client. Credentials and tokens are stored securely in your browser's local storage and never shared with third parties.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
