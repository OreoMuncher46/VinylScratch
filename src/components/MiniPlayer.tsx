import React, { useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Disc } from 'lucide-react';
import { useAppState } from '../store/AppStore';
import { audioEngine } from '../AudioEngine';

export const MiniPlayer: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { queue, queueIndex, isPlaying } = state;

  const currentTrack = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;

  const handleTogglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    if (isPlaying) {
      audioEngine.pause();
      dispatch({ type: 'SET_PLAYING', playing: false });
    } else {
      audioEngine.play();
      dispatch({ type: 'SET_PLAYING', playing: true });
    }
  }, [currentTrack, isPlaying, dispatch]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (queue.length === 0) return;
    const nextIdx = (queueIndex + 1) % queue.length;
    dispatch({ type: 'SET_QUEUE_INDEX', index: nextIdx });
  }, [queue, queueIndex, dispatch]);

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (queue.length === 0) return;
    const prevIdx = (queueIndex - 1 + queue.length) % queue.length;
    dispatch({ type: 'SET_QUEUE_INDEX', index: prevIdx });
  }, [queue, queueIndex, dispatch]);

  const handleExpand = useCallback(() => {
    dispatch({ type: 'EXPAND_NOW_PLAYING' });
  }, [dispatch]);

  if (!currentTrack) return null;

  return (
    <div className="mini-player-bar" onClick={handleExpand}>
      <div className="mini-player-bar__track">
        <div className="mini-player-bar__art">
          <img src={currentTrack.albumArtUrl} alt="" draggable={false} />
          {isPlaying && (
            <div className="mini-player-bar__spinning-disc">
              <Disc size={16} className="icon-spin" />
            </div>
          )}
        </div>
        <div className="mini-player-bar__info">
          <div className="mini-player-bar__title">{currentTrack.title}</div>
          <div className="mini-player-bar__artist">{currentTrack.artist}</div>
        </div>
      </div>

      <div className="mini-player-bar__controls">
        <button className="mini-player-bar__btn" onClick={handlePrev}>
          <SkipBack size={18} />
        </button>
        <button className="mini-player-bar__btn mini-player-bar__btn--play" onClick={handleTogglePlay}>
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="mini-player-bar__btn" onClick={handleNext}>
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
};
