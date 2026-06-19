// Synthesizes a organic wooden "clack" sound using Web Audio API.
// Avoids loading external files and guarantees audio works instantly.

class WoodSoundSynthesizer {
  constructor() {
    this.audioCtx = null;
    this.muted = false;
  }

  init() {
    if (this.audioCtx) return;
    
    // Defer AudioContext creation until user interaction (click) to respect browser autoplay policies.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playClack(velocity = 1.0) {
    this.init();
    if (!this.audioCtx || this.muted) return;

    // Resume context if suspended (common in browsers after inactivity)
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const now = this.audioCtx.currentTime;

    // Create nodes
    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();

    // 1. Woody timbre setup
    // We combine two triangle oscillators to create a hollow, woody resonance
    osc1.type = 'triangle';
    osc2.type = 'sine';

    // Randomize pitch slightly to simulate physical imperfections in beads
    const baseFreq = 950 + (Math.random() - 0.5) * 80;
    const secondFreq = baseFreq * 1.5;

    osc1.frequency.setValueAtTime(baseFreq, now);
    // Pitch sweep: wood impact starts high and drops instantly
    osc1.frequency.exponentialRampToValueAtTime(300, now + 0.035);

    osc2.frequency.setValueAtTime(secondFreq, now);
    osc2.frequency.exponentialRampToValueAtTime(150, now + 0.04);

    // 2. Resonant bandpass filter
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3.5, now);

    // 3. Fast amplitude envelope
    const attack = 0.002;
    const decay = 0.04 + Math.random() * 0.02; // Slight variance in decay length
    const volume = velocity * 0.15; // Keep it subtle and pleasant

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    // Connections
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    // Play & Stop
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + attack + decay + 0.01);
    osc2.stop(now + attack + decay + 0.01);
  }
}

export const soundSynth = new WoodSoundSynthesizer();
