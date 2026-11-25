class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playDiceRoll() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Wooden clack sequence
    [0, 0.08, 0.17, 0.27].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + i * 35, now + offset);
      osc.frequency.exponentialRampToValueAtTime(90, now + offset + 0.06);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.07);
    });
  }

  playBuild(heavy = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 180 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 65 : 110, now + 0.14);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playResourceChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.08, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.24);
    });
  }

  playRobberAlert() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [196, 185].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.08, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.24);
    });
  }

  playTrade() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.11, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.2);
    });
  }

  playVictory() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.14, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.48);
    });
  }
}

export const soundEngine = new SoundEngine();
