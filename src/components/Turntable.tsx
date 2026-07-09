import React, { useRef, useState, useEffect, useCallback } from 'react';
import { audioEngine, TrackData } from '../AudioEngine';

interface TurntableProps {
  track: TrackData | null;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
}

const RPM = 33.333;
const DEG_PER_SEC = RPM * 6; // 33.333 * 6 = 200 deg/s
const SEC_PER_RADIAN = 1.8 / (2 * Math.PI); // 1 full vinyl turn ≈ 1.8s of audio

export const Turntable: React.FC<TurntableProps> = ({ track, isPlaying, onTimeUpdate }) => {
  const platterRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Physics refs (not state — we don't want React re-renders at 60fps)
  const angleRef = useRef(0);
  const lastTouchAngle = useRef(0);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isScratchingRef = useRef(false);

  // Only these two drive visual updates via state
  const [visualAngle, setVisualAngle] = useState(0);
  const [scratchDisplay, setScratchDisplay] = useState<{ active: boolean; speed: number }>({ active: false, speed: 0 });

  // ── Main rAF Loop ──
  useEffect(() => {
    let prev = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05); // cap at 50ms to prevent spiral on tab-unfocus
      prev = now;

      if (!isScratchingRef.current && isPlaying) {
        angleRef.current += DEG_PER_SEC * dt;
        setVisualAngle(angleRef.current);
        onTimeUpdate(audioEngine.playhead);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, onTimeUpdate]);

  // ── Pointer Handlers ──
  const getAngleFromPointer = useCallback((clientX: number, clientY: number): number => {
    const rect = platterRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2));
  }, []);

  const isOnDisc = useCallback((clientX: number, clientY: number): boolean => {
    const rect = platterRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    return dist > 30 && dist < rect.width / 2 + 8;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!track || !isOnDisc(e.clientX, e.clientY)) return;
    e.preventDefault();
    platterRef.current?.setPointerCapture(e.pointerId);

    isScratchingRef.current = true;
    setScratchDisplay({ active: true, speed: 0 });
    audioEngine.beginScratch();

    lastTouchAngle.current = getAngleFromPointer(e.clientX, e.clientY);
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
  }, [track, getAngleFromPointer, isOnDisc]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScratchingRef.current || !track) return;

    const now = performance.now();
    const dt = (now - lastTimeRef.current) / 1000;
    if (dt <= 0) return;

    const angle = getAngleFromPointer(e.clientX, e.clientY);
    let dAngle = angle - lastTouchAngle.current;

    // Wrap atan2 discontinuity
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

    // Map angular displacement to audio time
    const timeDelta = dAngle * SEC_PER_RADIAN;
    audioEngine.seek(audioEngine.playhead + timeDelta);

    // Compute speed ratio with exponential smoothing
    const raw = timeDelta / dt;
    const alpha = 0.3;
    velocityRef.current = alpha * raw + (1 - alpha) * velocityRef.current;
    audioEngine.scratchSpeed(velocityRef.current);

    // Update visual rotation
    angleRef.current += dAngle * (180 / Math.PI);
    setVisualAngle(angleRef.current);
    setScratchDisplay({ active: true, speed: velocityRef.current });

    lastTouchAngle.current = angle;
    lastTimeRef.current = now;
  }, [track, getAngleFromPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScratchingRef.current) return;
    platterRef.current?.releasePointerCapture(e.pointerId);

    // Spring-damper catch-up to motor speed
    const targetSpeed = isPlaying ? 1.0 : 0.0;
    let speed = velocityRef.current;
    let ts = performance.now();

    const spring = () => {
      // Bail if user re-grabbed the disc
      if (isScratchingRef.current) return;

      const now = performance.now();
      const dt = Math.min((now - ts) / 1000, 0.05);
      ts = now;
      if (dt <= 0) { requestAnimationFrame(spring); return; }

      // Spring: F = -k(x - target) - c*v
      const k = 10.0;
      const c = 4.0;
      const accel = -k * (speed - targetSpeed) - c * (speed - targetSpeed);
      speed += accel * dt;

      audioEngine.scratchSpeed(speed);
      angleRef.current += DEG_PER_SEC * speed * dt;
      setVisualAngle(angleRef.current);
      setScratchDisplay({ active: true, speed });
      onTimeUpdate(audioEngine.playhead);

      if (Math.abs(speed - targetSpeed) < 0.02) {
        isScratchingRef.current = false;
        setScratchDisplay({ active: false, speed: 0 });
        audioEngine.endScratch();
      } else {
        requestAnimationFrame(spring);
      }
    };

    requestAnimationFrame(spring);
  }, [isPlaying, onTimeUpdate]);

  return (
    <div className="turntable-wrapper">
      {/* Platter */}
      <div
        ref={platterRef}
        className="turntable-platter"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Vinyl Record (rotates) */}
        <div
          className="vinyl-record"
          style={{ transform: `rotate(${visualAngle % 360}deg)` }}
        >
          {/* Center Label */}
          <div className="vinyl-label">
            {track ? (
              <img src={track.albumArtUrl} alt={track.title} draggable={false} />
            ) : (
              <div className="vinyl-label__fallback" />
            )}
            <div className="vinyl-spindle">
              <div className="vinyl-spindle__dot" />
            </div>
          </div>
        </div>

        {/* Tonearm */}
        <div className="tonearm-mount">
          <div className="tonearm-pivot">
            <div className="tonearm-pivot__inner" />
          </div>
          <div className={`tonearm-body ${isPlaying ? 'tonearm-body--playing' : ''}`}>
            <div className="tonearm-rod">
              <div className="tonearm-counterweight" />
              <div className="tonearm-cartridge">
                <div className="tonearm-needle" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Pill */}
      <div className="status-pill">
        <span className={`status-dot ${
          scratchDisplay.active
            ? 'status-dot--scratching'
            : isPlaying
            ? 'status-dot--playing'
            : 'status-dot--ready'
        }`} />
        <span>
          {scratchDisplay.active ? 'SCRATCHING' : isPlaying ? 'PLAYING' : 'READY'}
        </span>
        {scratchDisplay.active && (
          <span className="status-speed">{scratchDisplay.speed.toFixed(2)}×</span>
        )}
      </div>
    </div>
  );
};
