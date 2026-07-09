import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState, TrackItem } from '../store/AppStore';
import { Turntable } from './Turntable';
import { audioEngine } from '../AudioEngine';
import { resolveStreamUrl } from '../api/StreamResolver';

export const NowPlaying: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { queue, queueIndex, isPlaying, nowPlayingExpanded, streamQuality, loading } = state;

  const currentTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
  const [playhead, setPlayhead] = useState(0);

  // Sync playhead state
  useEffect(() => {
    if (!isPlaying) {
      setPlayhead(audioEngine.playhead);
    }
  }, [isPlaying]);

  // Load and play track if the index changes
  useEffect(() => {
    if (!currentTrack) return;
    const track: TrackItem = currentTrack;

    let active = true;

    async function load() {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        let url = track.audioUrl;
        if (!url && track.spotifyId) {
          // Resolve Spotify ID to a streaming stream URL via Piped API
          url = await resolveStreamUrl(track, streamQuality);
        }

        if (url && active) {
          await audioEngine.loadTrack({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            albumArtUrl: track.albumArtUrl,
            audioUrl: url,
          });

          if (isPlaying) {
            audioEngine.play();
          }
        }
      } catch (err) {
        console.error('Failed to resolve track:', err);
      } finally {
        if (active) {
          dispatch({ type: 'SET_LOADING', loading: false });
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [currentTrack, streamQuality, dispatch]);

  const handleTogglePlay = useCallback(() => {
    if (!currentTrack || loading) return;
    if (isPlaying) {
      audioEngine.pause();
      dispatch({ type: 'SET_PLAYING', playing: false });
    } else {
      audioEngine.play();
      dispatch({ type: 'SET_PLAYING', playing: true });
    }
  }, [currentTrack, isPlaying, loading, dispatch]);

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;
    const nextIdx = (queueIndex + 1) % queue.length;
    dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx });
  }, [queue, queueIndex, dispatch]);

  const handlePrev = useCallback(() => {
    if (queue.length === 0) return;
    const prevIdx = (queueIndex - 1 + queue.length) % queue.length;
    dispatch({ type: 'SET_QUEUE_INDEX', index: prevIdx });
  }, [queue, queueIndex, dispatch]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPlayhead(val);
    audioEngine.seek(val);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    audioEngine.setVolume(v);
  }, []);

  const handleCollapse = useCallback(() => {
    dispatch({ type: 'COLLAPSE_NOW_PLAYING' });
  }, [dispatch]);

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const duration = currentTrack?.duration || audioEngine.duration || 1;

  return (
    <AnimatePresence>
      {nowPlayingExpanded && currentTrack && (
        <motion.div
          className="now-playing-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 24, stiffness: 180 }}
        >
          {/* Header Drag Handle */}
          <div className="now-playing-panel__drag-handle" onClick={handleCollapse}>
            <ChevronDown size={24} />
          </div>

          <div className="now-playing-panel__content">
            {/* Turntable Section */}
            {loading ? (
              <div className="loading-state">
                <span className="loading-spinner" />
                <span className="loading-text">Resolving audio stream...</span>
              </div>
            ) : (
              <Turntable track={currentTrack} isPlaying={isPlaying} onTimeUpdate={setPlayhead} />
            )}

            {/* Info */}
            <div className="track-info">
              <h3 className="track-info__title">{currentTrack.title}</h3>
              <p className="track-info__subtitle">{currentTrack.artist}</p>
            </div>

            {/* Seeker */}
            <div className="seeker-row">
              <span className="seeker-time">{fmtTime(playhead)}</span>
              <input
                type="range"
                className="range-slider"
                min={0}
                max={duration}
                step={0.1}
                value={playhead}
                onChange={handleSeek}
              />
              <span className="seeker-time seeker-time--end">{fmtTime(duration)}</span>
            </div>

            {/* Transport */}
            <div className="transport-row">
              <div className="volume-strip">
                <Volume2 size={16} className="volume-strip__icon" />
                <input
                  type="range"
                  className="range-slider range-slider--small"
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={1}
                  onChange={handleVolumeChange}
                />
              </div>

              <div className="transport-controls">
                <button className="transport-btn" onClick={handlePrev}>
                  <SkipBack size={20} />
                </button>
                <button className="transport-btn transport-btn--play" onClick={handleTogglePlay}>
                  {isPlaying ? <Pause size={22} fill="#000" /> : <Play size={22} fill="#000" />}
                </button>
                <button className="transport-btn" onClick={handleNext}>
                  <SkipForward size={20} />
                </button>
              </div>

              <span className="rpm-badge">33⅓ RPM</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
