/**
 * AudioEngine — Web Audio API low-latency turntable scratching engine.
 *
 * Maintains a forward and reversed AudioBuffer to support bidirectional
 * scratching. Uses AudioBufferSourceNode with dynamic playbackRate for
 * real-time speed/pitch manipulation, and a GainNode with micro-fades
 * to eliminate digital pops on source transitions.
 */

export interface TrackData {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  albumArtUrl: string;
  audioUrl?: string;
  accentColor?: string;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private forwardBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;

  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private _isPlaying = false;
  private _isScratching = false;
  private playheadSec = 0;
  private ctxTimeSnapshot = 0;
  private rate = 1.0;
  private forward = true;

  private progressTimer: number | null = null;
  private onProgressCb: ((t: number) => void) | null = null;

  // ── Lifecycle ──

  public init(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // ── Public Getters ──

  public get isPlaying(): boolean { return this._isPlaying; }
  public get isScratching(): boolean { return this._isScratching; }

  public get duration(): number {
    return this.forwardBuffer?.duration ?? 0;
  }

  public get playhead(): number {
    if (!this._isPlaying || this._isScratching || !this.ctx || !this.forwardBuffer) {
      return this.playheadSec;
    }
    const elapsed = this.ctx.currentTime - this.ctxTimeSnapshot;
    const dur = this.forwardBuffer.duration;
    let t = this.playheadSec + elapsed * this.rate * (this.forward ? 1 : -1);
    // Wrap within [0, duration]
    t = ((t % dur) + dur) % dur;
    return t;
  }

  // ── Public API ──

  public onProgress(cb: (t: number) => void): void {
    this.onProgressCb = cb;
  }

  public setVolume(v: number): void {
    if (!this.ctx || !this.gainNode) return;
    const clamped = Math.max(0, Math.min(1, v));
    this.gainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.03);
  }

  public async loadTrack(track: TrackData): Promise<void> {
    this.init();
    this.stop();

    if (!track.audioUrl) {
      this.forwardBuffer = this.generateBeat();
    } else {
      const res = await fetch(track.audioUrl);
      const ab = await res.arrayBuffer();
      this.forwardBuffer = await this.ctx!.decodeAudioData(ab);
    }
    this.reversedBuffer = this.reverseBuffer(this.forwardBuffer);
    this.playheadSec = 0;
  }

  public play(): void {
    this.init();
    if (!this.forwardBuffer || this._isPlaying) return;
    this._isPlaying = true;
    this._isScratching = false;
    this.rate = 1.0;
    this.forward = true;
    this.snapshotCtxTime();
    this.createSource(this.playheadSec, 1.0, true);
    this.startProgress();
  }

  public pause(): void {
    if (!this._isPlaying) return;
    this.playheadSec = this.playhead;
    this._isPlaying = false;
    this.destroySource();
    this.stopProgress();
  }

  public stop(): void {
    this.playheadSec = 0;
    this._isPlaying = false;
    this._isScratching = false;
    this.destroySource();
    this.stopProgress();
  }

  public seek(t: number): void {
    if (!this.forwardBuffer) return;
    this.playheadSec = Math.max(0, Math.min(t, this.forwardBuffer.duration));
    this.snapshotCtxTime();
    this.onProgressCb?.(this.playheadSec);
    if (this._isPlaying && !this._isScratching) {
      this.createSource(this.playheadSec, this.rate, this.forward);
    }
  }

  // ── Scratch Interface ──

  public beginScratch(): void {
    this.init();
    if (!this.forwardBuffer) return;
    this.playheadSec = this.playhead;
    this._isScratching = true;
    this.destroySource();
  }

  public scratchSpeed(speed: number): void {
    if (!this._isScratching || !this.forwardBuffer || !this.ctx) return;

    const abs = Math.abs(speed);
    const fwd = speed >= 0;

    if (abs < 0.05) {
      this.destroySource();
      this.rate = 0;
      return;
    }

    const directionChanged = this.forward !== fwd;
    const noSource = !this.sourceNode;
    const bigDelta = Math.abs(this.rate - abs) > 0.15;

    if (directionChanged || noSource || bigDelta) {
      this.playheadSec = this.playhead;
      this.forward = fwd;
      this.rate = abs;
      this.snapshotCtxTime();
      this.createSource(this.playheadSec, this.rate, this.forward);
    } else if (this.sourceNode) {
      this.sourceNode.playbackRate.setTargetAtTime(abs, this.ctx.currentTime, 0.02);
      this.rate = abs;
    }
  }

  public endScratch(): void {
    if (!this._isScratching) return;
    this._isScratching = false;
    this.playheadSec = this.playhead;

    if (this._isPlaying) {
      this.forward = true;
      this.rate = 1.0;
      this.snapshotCtxTime();
      this.createSource(this.playheadSec, 1.0, true);
    } else {
      this.destroySource();
    }
  }

  // ── Internal Source Management ──

  private snapshotCtxTime(): void {
    if (this.ctx) this.ctxTimeSnapshot = this.ctx.currentTime;
  }

  private createSource(offset: number, rate: number, fwd: boolean): void {
    if (!this.ctx || !this.forwardBuffer || !this.reversedBuffer || !this.gainNode) return;
    this.destroySource();

    const dur = this.forwardBuffer.duration;
    const clamped = ((offset % dur) + dur) % dur;

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = fwd ? this.forwardBuffer : this.reversedBuffer;
    this.sourceNode.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
    this.sourceNode.loop = true;
    this.sourceNode.start(0, fwd ? clamped : Math.max(0, dur - clamped));

    // 5ms fade-in to prevent pops
    this.gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.gainNode.gain.exponentialRampToValueAtTime(
      Math.max(0.001, this.gainNode.gain.value || 1.0),
      this.ctx.currentTime + 0.005
    );

    this.sourceNode.connect(this.gainNode);
    this.snapshotCtxTime();
  }

  private destroySource(): void {
    if (!this.sourceNode) return;
    try { this.sourceNode.stop(); } catch { /* not started */ }
    this.sourceNode.disconnect();
    this.sourceNode = null;
  }

  private startProgress(): void {
    this.stopProgress();
    this.progressTimer = window.setInterval(() => {
      this.onProgressCb?.(this.playhead);
    }, 80);
  }

  private stopProgress(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  // ── Buffer Reversal ──

  private reverseBuffer(buf: AudioBuffer): AudioBuffer {
    const reversed = this.ctx!.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0, len = buf.length; i < len; i++) {
        dst[i] = src[len - 1 - i];
      }
    }
    return reversed;
  }

  // ── Synthetic Beat Generator (120 BPM, 8s loop) ──

  private generateBeat(): AudioBuffer {
    const sr = 44100;
    const dur = 8.0;
    const N = sr * dur;
    const buf = this.ctx!.createBuffer(2, N, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const bpm = 120;
    const beat = 60 / bpm;
    const TWO_PI = 2 * Math.PI;

    for (let i = 0; i < N; i++) {
      const t = i / sr;
      let s = 0;

      // Kick — every beat
      const kt = t % beat;
      if (kt < 0.2) {
        const phase = TWO_PI * (45 * kt + (95 / 25) * (1 - Math.exp(-25 * kt)));
        s += Math.sin(phase) * Math.exp(-12 * kt) * 0.65;
      }

      // Snare — beats 2 & 4
      const st = (t - beat) % (beat * 2);
      if (st >= 0 && st < 0.2) {
        s += (Math.random() * 2 - 1) * Math.exp(-16 * st) * 0.28;
        s += Math.sin(TWO_PI * 185 * st) * Math.exp(-28 * st) * 0.2;
      }

      // Hi-hat — 8th notes
      const ht = t % (beat / 2);
      s += (Math.random() * 2 - 1) * Math.exp(-60 * ht) * 0.1;

      // Bass — E minor progression
      const bar = Math.floor(t / 2) % 4;
      const bassHz = [41.2, 49.0, 55.0, 73.4][bar];
      const bt2 = t % (beat / 2);
      if (bt2 < beat / 2 - 0.03) {
        const bp = (t * bassHz * TWO_PI) % TWO_PI;
        s += (1 - bp / Math.PI) * 0.14 * Math.exp(-5 * bt2);
      }

      // Arp lead
      const arpHz = [164.81, 196, 246.94, 293.66, 329.63, 293.66, 246.94, 196,
                      220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
      const ni = Math.floor(t / (beat / 2)) % 16;
      const nt = t % (beat / 2);
      if (nt < beat / 2 - 0.05) {
        const lp = (t * arpHz[ni] * TWO_PI) % TWO_PI;
        const tri = lp < Math.PI ? 2 * lp / Math.PI - 1 : 3 - 2 * lp / Math.PI;
        s += tri * 0.07 * Math.exp(-7 * nt);
      }

      s = Math.max(-1, Math.min(1, s));
      const pan = 0.08 * Math.sin(TWO_PI * 0.25 * t);
      L[i] = s * (1 - pan) * 0.78;
      R[i] = s * (1 + pan) * 0.78;
    }
    return buf;
  }
}

export const audioEngine = new AudioEngine();
