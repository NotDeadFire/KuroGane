export class KuroganeSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;
  private ambientNodes: {
    oscs: OscillatorNode[];
    lfo: OscillatorNode;
    gain: GainNode;
    noiseSrc: AudioBufferSourceNode;
  } | null = null;
  private enabled = false;
  private volume = 0.65;
  private sequenceTimers: number[] = [];
  private scoreTimerId: number | null = null;
  private ambientMusicTimerId: number | null = null;
  private slashShaperCurve: Float32Array<ArrayBuffer> | null = null;

  private getSlashShaperCurve(): Float32Array<ArrayBuffer> {
    if (this.slashShaperCurve) return this.slashShaperCurve;
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * 3.8);
    }
    this.slashShaperCurve = curve;
    return curve;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.enabled ? this.volume : 0,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public async enable(vol = this.volume): Promise<boolean> {
    this.volume = Math.max(0, Math.min(1, vol));
    this.enabled = true;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return false;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
      }
      return true;
    } catch {
      return false;
    }
  }

  public disable(): void {
    this.enabled = false;
    this.clearSequence();
    this.stopAmbientLoop();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    }
  }

  public clearSequence(): void {
    for (const id of this.sequenceTimers) {
      window.clearTimeout(id);
    }
    this.sequenceTimers = [];
    this.stopScoreLoop();
    this.stopRumble();
  }

  private stopScoreLoop(): void {
    if (this.scoreTimerId !== null) {
      window.clearInterval(this.scoreTimerId);
      this.scoreTimerId = null;
    }
  }

  private stopRumble(): void {
    if (this.rumbleGain && this.ctx) {
      try {
        this.rumbleGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
      } catch {
        // ignore
      }
    }
    if (this.rumbleOsc) {
      const osc = this.rumbleOsc;
      this.rumbleOsc = null;
      window.setTimeout(() => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      }, 300);
    }
  }

  private playTaikoHit(time: number, amp = 0.34, pitch = 88): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, time);
    osc.frequency.exponentialRampToValueAtTime(34, time + 0.28);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  private playArcanePluck(time: number, freq: number, amp = 0.13, dur = 0.75): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const over = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    over.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    over.frequency.setValueAtTime(freq * 2, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(4800, freq * 5.2), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(260, freq * 1.15), time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    const overGain = this.ctx.createGain();
    overGain.gain.value = 0.32;

    osc.connect(filter);
    over.connect(overGain);
    overGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    over.start(time);
    osc.stop(time + dur + 0.05);
    over.stop(time + dur + 0.05);
  }

  private playDarkStringChord(time: number, freqs: number[], amp = 0.11, dur = 2.6): void {
    if (!this.ctx || !this.masterGain) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, time);
    filter.frequency.exponentialRampToValueAtTime(1180, time + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(380, time + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(amp, time + dur * 0.25);
    env.gain.setValueAtTime(amp * 0.85, time + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    filter.connect(env);
    env.connect(this.masterGain);

    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, time);
      osc.detune.setValueAtTime(idx % 2 === 0 ? -7 : 7, time);
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.value = idx === 0 ? 0.48 : 0.28;
      osc.connect(voiceGain);
      voiceGain.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.06);
    });
  }

  /**
   * Dramatic D-minor / Phrygian dark-anime orchestral & taiko awakening score (~100 BPM).
   * Escalates across the grimoire flip, sword emergence, orbital showcase, and hero reveal.
   */
  public startAwakeningScore(elapsedSec = 0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    this.stopScoreLoop();

    const stepSec = 0.3; // 100 BPM eighth-note grid
    let step = Math.max(0, Math.floor(elapsedSec / stepSec));
    let nextNoteTime = this.ctx.currentTime + 0.04;

    // D Phrygian / Dark Minor progression: Dm -> Bb -> Gm -> A
    const chords = [
      [73.42, 146.83, 220.0, 293.66, 349.23], // Dm
      [58.27, 116.54, 174.61, 233.08, 293.66], // Bb
      [98.0, 146.83, 196.0, 233.08, 293.66], // Gm
      [55.0, 110.0, 164.81, 220.0, 277.18], // A
    ];
    const arpPattern = [293.66, 349.23, 440.0, 466.16, 440.0, 349.23, 329.63, 277.18];
    const heroLead = [587.33, 0, 698.46, 659.25, 587.33, 554.37, 587.33, 880.0];

    const scheduleStep = (s: number, t: number) => {
      const approxSec = s * stepSec;
      const inSwordPhase = approxSec >= 4.8;
      const inClimaxPhase = approxSec >= 9.2;

      // Dark strings chord every 8 steps (2.4s)
      if (s % 8 === 0) {
        const chordIdx = Math.floor(s / 8) % chords.length;
        this.playDarkStringChord(t, chords[chordIdx], inSwordPhase ? 0.13 : 0.085, 2.55);
      }

      // Driving Taiko war drums
      if (s % 4 === 0) {
        this.playTaikoHit(t, inClimaxPhase ? 0.36 : 0.25, 92);
      } else if (inSwordPhase && (s % 8 === 3 || s % 8 === 6)) {
        this.playTaikoHit(t, 0.21, 76);
      }

      // Low bass ostinato pulse
      if (s % 2 === 0) {
        const chordIdx = Math.floor(s / 8) % chords.length;
        this.playArcanePluck(t, chords[chordIdx][0], inClimaxPhase ? 0.2 : 0.14, 0.42);
      }

      // Mysterious shamisen / arcane bell arpeggio
      const arpFreq = arpPattern[s % arpPattern.length];
      this.playArcanePluck(t, arpFreq, inSwordPhase ? 0.12 : 0.085, 0.65);

      // High gothic melody kicks in as sword orbits & awakens
      if (inClimaxPhase) {
        const leadFreq = heroLead[s % heroLead.length];
        if (leadFreq > 0) {
          this.playArcanePluck(t, leadFreq, 0.095, 0.9);
        }
      }
    };

    const pump = () => {
      if (!this.enabled || !this.ctx) return;
      while (nextNoteTime < this.ctx.currentTime + 0.35) {
        scheduleStep(step, nextNoteTime);
        nextNoteTime += stepSec;
        step += 1;
      }
    };

    pump();
    this.scoreTimerId = window.setInterval(pump, 100);
  }

  /**
   * Extended Five-Leaf Grimoire & Multi-Angle Sword Awakening Choreography (~17.5s):
   * 1. Deep sub-bass rumble + escalating dark-anime orchestral theme (0s)
   * 2. Five-leaf grimoire manifests & flips + metallic resonance (1.5s)
   * 3. Spectral cadence motif (2.8s)
   * 4. Black sword unleashes from flipped grimoire + katana draw & energy swell (5.2s)
   * 5. Orbital blade showcase resonance (9.6s)
   * 6. Hero forged blade impact + bass drop (14.4s)
   */
  public playAwakeningSequence(elapsedSec = 0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    this.clearSequence();

    this.playSubRumble(16.5);
    this.startAwakeningScore(elapsedSec);

    const scheduleAt = (targetSec: number, fn: () => void) => {
      const delayMs = Math.max(0, (targetSec - elapsedSec) * 1000);
      if (targetSec >= elapsedSec - 0.35) {
        const id = window.setTimeout(() => {
          if (this.enabled) fn();
        }, delayMs);
        this.sequenceTimers.push(id);
      }
    };

    scheduleAt(1.5, () => this.playMetallicResonance(0.28, 3.2));
    scheduleAt(2.8, () => this.playAnimeSpectralCadence());
    scheduleAt(5.2, () => {
      this.playKatanaDraw();
      this.playTrueSwordSlash(0.14, 0.72, -0.55, 0.55);
      this.playGrimoireEnergySwell(3.6);
    });
    scheduleAt(9.6, () => this.playMetallicResonance(0.32, 3.0));
    scheduleAt(14.4, () => {
      this.playSwordImpact();
      this.playBassDrop();
    });
  }

  /**
   * Original synthesized anime-style playful-yet-eerie spectral bard cadence
   * ("yo-ho-ho-ho" rhythmic staccato vocal-formant pulse + shamisen pluck + echo).
   */
  public playAnimeSpectralCadence(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // 4-syllable rhythmic motif: pickup + 3 bouncing upper pulses
    const syllables = [
      { offset: 0.0, freq: 246.94, formant: 620, dur: 0.16, amp: 0.22 }, // B3 "Yo-"
      { offset: 0.22, freq: 329.63, formant: 780, dur: 0.14, amp: 0.24 }, // E4 "-ho-"
      { offset: 0.42, freq: 369.99, formant: 860, dur: 0.14, amp: 0.24 }, // F#4 "-ho-"
      { offset: 0.62, freq: 392.0, formant: 940, dur: 0.34, amp: 0.28 }, // G4 "-ho!"
    ];

    syllables.forEach((s) => {
      if (!this.ctx || !this.masterGain) return;
      const t0 = now + s.offset;

      // Vocal-formant carrier (sawtooth + triangle harmonic)
      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      sub.type = 'triangle';

      osc.frequency.setValueAtTime(s.freq * 0.96, t0);
      osc.frequency.exponentialRampToValueAtTime(s.freq, t0 + 0.04);
      osc.frequency.exponentialRampToValueAtTime(s.freq * 0.98, t0 + s.dur);

      sub.frequency.setValueAtTime(s.freq * 0.5, t0);

      // Dual formant bandpass for haunting anime vocal resonance
      const formant1 = this.ctx.createBiquadFilter();
      formant1.type = 'bandpass';
      formant1.Q.value = 5.5;
      formant1.frequency.setValueAtTime(s.formant, t0);
      formant1.frequency.exponentialRampToValueAtTime(s.formant * 1.12, t0 + s.dur);

      const formant2 = this.ctx.createBiquadFilter();
      formant2.type = 'bandpass';
      formant2.Q.value = 4.0;
      formant2.frequency.setValueAtTime(s.formant * 2.1, t0);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(s.amp, t0 + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);

      osc.connect(formant1);
      osc.connect(formant2);
      sub.connect(formant1);
      formant1.connect(env);
      formant2.connect(env);
      env.connect(this.masterGain);

      osc.start(t0);
      sub.start(t0);
      osc.stop(t0 + s.dur + 0.04);
      sub.stop(t0 + s.dur + 0.04);

      // Crisp shamisen-inspired steel pluck overtone
      const pluck = this.ctx.createOscillator();
      const pluckGain = this.ctx.createGain();
      pluck.type = 'triangle';
      pluck.frequency.setValueAtTime(s.freq * 2, t0);
      pluckGain.gain.setValueAtTime(0.001, t0);
      pluckGain.gain.linearRampToValueAtTime(0.11, t0 + 0.008);
      pluckGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      pluck.connect(pluckGain);
      pluckGain.connect(this.masterGain);
      pluck.start(t0);
      pluck.stop(t0 + 0.25);
    });

    // Ghostly echo tail after final syllable
    const echoTime = now + 1.02;
    const echoOsc = this.ctx.createOscillator();
    const echoFilter = this.ctx.createBiquadFilter();
    const echoGain = this.ctx.createGain();
    echoOsc.type = 'sine';
    echoOsc.frequency.setValueAtTime(392.0, echoTime);
    echoOsc.frequency.exponentialRampToValueAtTime(369.99, echoTime + 0.7);
    echoFilter.type = 'bandpass';
    echoFilter.frequency.value = 750;
    echoGain.gain.setValueAtTime(0.0001, echoTime);
    echoGain.gain.linearRampToValueAtTime(0.09, echoTime + 0.05);
    echoGain.gain.exponentialRampToValueAtTime(0.0001, echoTime + 0.85);
    echoOsc.connect(echoFilter);
    echoFilter.connect(echoGain);
    echoGain.connect(this.masterGain);
    echoOsc.start(echoTime);
    echoOsc.stop(echoTime + 0.9);
  }

  public playKatanaDraw(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Metallic blade slide shimmer
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(2960, now + 0.55);
    osc2.frequency.setValueAtTime(2220, now);
    osc2.frequency.exponentialRampToValueAtTime(4180, now + 0.55);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.9);
    osc2.stop(now + 0.9);
  }

  /**
   * Distinct crisp black-blade unsheathe sound effect triggered when starting a new chat:
   * Scabbard metal-on-leather friction slide -> shimmering high-carbon steel ring -> hilt lock snap.
   */
  public playUnsheathe(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.getSlashShaperCurve();
    shaper.connect(this.masterGain);

    // 1. Scabbard metallic draw scrape (0s -> 0.42s)
    const scrapeDur = 0.44;
    const scrapeBuf = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * scrapeDur),
      this.ctx.sampleRate,
    );
    const sData = scrapeBuf.getChannelData(0);
    for (let i = 0; i < sData.length; i++) {
      sData[i] = Math.random() * 2 - 1;
    }
    const scrapeSrc = this.ctx.createBufferSource();
    scrapeSrc.buffer = scrapeBuf;

    const scrapeFilter = this.ctx.createBiquadFilter();
    scrapeFilter.type = 'bandpass';
    scrapeFilter.Q.value = 3.4;
    scrapeFilter.frequency.setValueAtTime(980, now);
    scrapeFilter.frequency.exponentialRampToValueAtTime(4650, now + 0.36);

    const scrapeGain = this.ctx.createGain();
    scrapeGain.gain.setValueAtTime(0.001, now);
    scrapeGain.gain.linearRampToValueAtTime(0.32, now + 0.08);
    scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + scrapeDur);

    scrapeSrc.connect(scrapeFilter);
    scrapeFilter.connect(scrapeGain);
    scrapeGain.connect(shaper);
    scrapeSrc.start(now);

    // 2. Shimmering steel harmonics ("shiiing!") rising as blade clears sheath
    const harmonics = [1560, 2340, 3510, 5240];
    harmonics.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.78, now + 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.38);

      gain.gain.setValueAtTime(0.0001, now + 0.03);
      gain.gain.linearRampToValueAtTime(0.095 / (idx * 0.75 + 1), now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + 0.03);
      osc.stop(now + 0.76);
    });

    // 3. Crisp hilt clear / guard lock snap (+0.34s)
    const lockT = now + 0.34;
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(2880, lockT);
    clickOsc.frequency.exponentialRampToValueAtTime(1120, lockT + 0.07);
    clickGain.gain.setValueAtTime(0.0001, lockT);
    clickGain.gain.linearRampToValueAtTime(0.16, lockT + 0.006);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, lockT + 0.12);
    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickOsc.start(lockT);
    clickOsc.stop(lockT + 0.14);

    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(110, lockT);
    thud.frequency.exponentialRampToValueAtTime(42, lockT + 0.11);
    thudGain.gain.setValueAtTime(0.0001, lockT);
    thudGain.gain.linearRampToValueAtTime(0.22, lockT + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, lockT + 0.14);
    thud.connect(thudGain);
    thudGain.connect(this.masterGain);
    thud.start(lockT);
    thud.stop(lockT + 0.16);
  }

  public playSubRumble(durationSec = 7.5): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(36, now);
    osc.frequency.linearRampToValueAtTime(46, now + durationSec * 0.7);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(28, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(85, now);
    filter.frequency.exponentialRampToValueAtTime(145, now + durationSec * 0.6);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 1.2);
    gain.gain.setValueAtTime(0.24, now + durationSec - 1.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + durationSec + 0.1);
    osc2.stop(now + durationSec + 0.1);

    this.rumbleOsc = osc;
    this.rumbleGain = gain;
  }

  public playMetallicResonance(level = 0.28, duration = 2.6): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const ratios = [1, 1.414, 2.31, 3.17, 4.48];
    const baseFreq = 196;

    ratios.forEach((ratio, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * ratio * 0.992, now + duration);

      const amp = level / (idx * 1.4 + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  }

  public playGrimoireEnergySwell(duration = 2.4): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 4.2;
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(1750, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + duration * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + duration + 0.05);

    [110, 164.81, 220].forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.03, now + duration);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(240, now);
      lp.frequency.exponentialRampToValueAtTime(980, now + duration);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.075, now + duration * 0.8);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  }

  public playSwordImpact(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const sampleCount = Math.floor(this.ctx.sampleRate * 0.45);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.06));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(900, now);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.45, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    noise.connect(hp);
    hp.connect(nGain);
    nGain.connect(this.masterGain);
    noise.start(now);

    [587.33, 880, 1396.9, 2093].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.985, now + 2.4);

      gain.gain.setValueAtTime(0.22 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 2.45);
    });
  }

  public playBassDrop(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 1.45);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.62, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 2.7);
  }

  /**
   * Resonant dark-sanctum arrival chord played upon entering the main website.
   */
  public playSanctumEntrySound(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.playDarkStringChord(now, [73.42, 146.83, 220.0, 293.66, 440.0], 0.16, 2.8);
    this.playArcanePluck(now + 0.08, 587.33, 0.12, 1.5);
    this.playArcanePluck(now + 0.28, 659.25, 0.11, 1.5);
    this.playArcanePluck(now + 0.48, 880.0, 0.13, 1.8);
  }

  /**
   * High-intensity true steel sword slash synthesizer:
   * - Waveshaped razor edge snap (metallic crunch & bite)
   * - Dual stereo-sweeping air-cut layers (supersonic blade whistle + heavy wind shear)
   * - Tempered steel harmonic blade ring & sub-sonic chest thump
   */
  public playTrueSwordSlash(
    delaySec = 0,
    intensity = 1.0,
    panStart = 0.88,
    panEnd = -0.88,
  ): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const t0 = this.ctx.currentTime + delaySec;

    // Stereo sweep matching visual blade trajectory across the screen
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panStart)), t0);
    panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panEnd)), t0 + 0.34);
    panner.connect(this.masterGain);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.getSlashShaperCurve();
    shaper.oversample = '2x';
    shaper.connect(panner);

    // 1. Razor Edge Bite Snap (0ms - 70ms sharp steel transient)
    const snapSamples = Math.floor(this.ctx.sampleRate * 0.085);
    const snapBuf = this.ctx.createBuffer(1, snapSamples, this.ctx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapSamples; i++) {
      snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.014));
    }
    const snapSrc = this.ctx.createBufferSource();
    snapSrc.buffer = snapBuf;
    const snapFilter = this.ctx.createBiquadFilter();
    snapFilter.type = 'bandpass';
    snapFilter.Q.value = 1.8;
    snapFilter.frequency.setValueAtTime(4800, t0);
    snapFilter.frequency.exponentialRampToValueAtTime(1400, t0 + 0.08);
    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.85 * intensity, t0);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    snapSrc.connect(snapFilter);
    snapFilter.connect(snapGain);
    snapGain.connect(shaper);
    snapSrc.start(t0);

    // 2. Supersonic Blade Edge Whistle (sharp high-Q air slice 8200Hz -> 920Hz)
    const whistleDur = 0.34;
    const whistleBuf = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * whistleDur),
      this.ctx.sampleRate,
    );
    const wData = whistleBuf.getChannelData(0);
    for (let i = 0; i < wData.length; i++) {
      wData[i] = Math.random() * 2 - 1;
    }
    const whistleSrc = this.ctx.createBufferSource();
    whistleSrc.buffer = whistleBuf;
    const whistleFilter = this.ctx.createBiquadFilter();
    whistleFilter.type = 'bandpass';
    whistleFilter.Q.value = 3.8;
    whistleFilter.frequency.setValueAtTime(8400, t0);
    whistleFilter.frequency.exponentialRampToValueAtTime(920, t0 + whistleDur);
    const whistleGain = this.ctx.createGain();
    whistleGain.gain.setValueAtTime(0.001, t0);
    whistleGain.gain.linearRampToValueAtTime(0.72 * intensity, t0 + 0.032);
    whistleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + whistleDur);
    whistleSrc.connect(whistleFilter);
    whistleFilter.connect(whistleGain);
    whistleGain.connect(shaper);
    whistleSrc.start(t0);

    // 3. Heavy Broadsword Wind Shear ("FWOOSH!" air displacement 3100Hz -> 135Hz)
    const shearDur = 0.48;
    const shearBuf = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * shearDur),
      this.ctx.sampleRate,
    );
    const sData = shearBuf.getChannelData(0);
    for (let i = 0; i < sData.length; i++) {
      sData[i] = Math.random() * 2 - 1;
    }
    const shearSrc = this.ctx.createBufferSource();
    shearSrc.buffer = shearBuf;
    const shearFilter = this.ctx.createBiquadFilter();
    shearFilter.type = 'bandpass';
    shearFilter.Q.value = 1.45;
    shearFilter.frequency.setValueAtTime(3200, t0);
    shearFilter.frequency.exponentialRampToValueAtTime(135, t0 + shearDur);
    const shearGain = this.ctx.createGain();
    shearGain.gain.setValueAtTime(0.001, t0);
    shearGain.gain.linearRampToValueAtTime(0.78 * intensity, t0 + 0.055);
    shearGain.gain.exponentialRampToValueAtTime(0.0001, t0 + shearDur);
    shearSrc.connect(shearFilter);
    shearFilter.connect(shearGain);
    shearGain.connect(shaper);
    shearSrc.start(t0);

    // 4. Ringing Tempered Steel Blade Harmonics ("SHIIING!")
    const steelPartials = [1640, 2790, 4210, 6150];
    steelPartials.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * 1.04, t0 + 0.01);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.96, t0 + 0.72);
      gain.gain.setValueAtTime(0.0001, t0 + 0.01);
      gain.gain.linearRampToValueAtTime((0.14 / (idx * 0.8 + 1)) * intensity, t0 + 0.028);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.78);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(t0 + 0.01);
      osc.stop(t0 + 0.82);
    });

    // 5. Sub-Sonic Slash Impact Thump
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(175, t0 + 0.01);
    thump.frequency.exponentialRampToValueAtTime(31, t0 + 0.28);
    thumpGain.gain.setValueAtTime(0.0001, t0 + 0.01);
    thumpGain.gain.linearRampToValueAtTime(0.55 * intensity, t0 + 0.025);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    thump.connect(thumpGain);
    thumpGain.connect(panner);
    thump.start(t0 + 0.01);
    thump.stop(t0 + 0.38);
  }

  /**
   * Visceral anime sword slash transition sound (no voice):
   * Unsheathe tension scrape -> furious double steel diagonal cleave across stereo field -> bass shockwave -> Sanctum music.
   */
  public playSwordSlashTransition(): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    this.stopScoreLoop();
    const now = this.ctx.currentTime;

    // 1. Intense Steel Unsheathe & Tension Wind-up (0s -> 0.44s)
    this.playKatanaDraw();
    this.playDarkStringChord(now, [73.42, 146.83, 220.0, 329.63], 0.16, 1.45);

    const riserDur = 0.44;
    const riserBuf = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * riserDur),
      this.ctx.sampleRate,
    );
    const rData = riserBuf.getChannelData(0);
    for (let i = 0; i < rData.length; i++) {
      rData[i] = Math.random() * 2 - 1;
    }
    const riserSrc = this.ctx.createBufferSource();
    riserSrc.buffer = riserBuf;
    const riserFilter = this.ctx.createBiquadFilter();
    riserFilter.type = 'bandpass';
    riserFilter.Q.value = 3.2;
    riserFilter.frequency.setValueAtTime(320, now);
    riserFilter.frequency.exponentialRampToValueAtTime(3400, now + riserDur);
    const riserGain = this.ctx.createGain();
    riserGain.gain.setValueAtTime(0.001, now);
    riserGain.gain.linearRampToValueAtTime(0.32, now + riserDur - 0.02);
    riserGain.gain.exponentialRampToValueAtTime(0.001, now + riserDur);
    riserSrc.connect(riserFilter);
    riserFilter.connect(riserGain);
    riserGain.connect(this.masterGain);
    riserSrc.start(now);

    // 2. Primary Screen-Crossing Cleave (+440ms) + Secondary Razor Cross-Cut (+660ms) + Shockwave
    const id1 = window.setTimeout(() => {
      if (this.enabled && this.ctx) {
        this.playTrueSwordSlash(0, 1.18, 0.92, -0.92);
        this.playTrueSwordSlash(0.21, 0.85, -0.65, 0.72);
        this.playSwordImpact();
        this.playBassDrop();
        this.playTaikoHit(this.ctx.currentTime, 0.52, 112);
      }
    }, 440);
    this.sequenceTimers.push(id1);

    // 3. Sanctum entry chord + continuous dark-fantasy Sanctum music loop (+1550ms)
    const id2 = window.setTimeout(() => {
      if (this.enabled) {
        this.playSanctumEntrySound();
        this.startAmbientLoop();
      }
    }, 1550);
    this.sequenceTimers.push(id2);
  }

  /**
   * Continuous, evolving Dark-Fantasy Sanctum Music Loop inside the main interface
   * (warm strings progression + subtle arcane harp/koto notes + nocturnal wind texture).
   */
  public startAmbientLoop(): void {
    if (!this.enabled || !this.ctx || !this.masterGain || this.ambientNodes) return;
    const now = this.ctx.currentTime;

    const ambientGain = this.ctx.createGain();
    ambientGain.gain.setValueAtTime(0.0001, now);
    ambientGain.gain.linearRampToValueAtTime(0.11, now + 2.0);
    ambientGain.connect(this.masterGain);

    // Warm dark fifth bed (D1=36.71Hz, A1=55Hz, D2=73.42Hz)
    const freqs = [36.71, 55.0, 73.42];
    const oscs: OscillatorNode[] = [];
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(190, now);
    padFilter.connect(ambientGain);

    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      o.type = idx === 0 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(f, now);
      const g = this.ctx.createGain();
      g.gain.value = idx === 0 ? 0.5 : idx === 1 ? 0.28 : 0.18;
      o.connect(g);
      g.connect(padFilter);
      o.start(now);
      oscs.push(o);
    });

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.11, now);
    lfoGain.gain.setValueAtTime(75, now);
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start(now);

    // Subtle looping night-wind texture
    const loopSec = 4;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * loopSec, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < ch.length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      ch[i] = lastOut * 2.1;
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(320, now);
    windFilter.Q.value = 1.8;

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.12, now);

    noiseSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientGain);
    noiseSrc.start(now);

    this.ambientNodes = { oscs, lfo, gain: ambientGain, noiseSrc };

    // Evolving Sanctum melodic theme (~84 BPM, D minor: Dm -> Bb -> C -> Am)
    const sanctumChords = [
      [73.42, 146.83, 220.0, 349.23],
      [58.27, 116.54, 174.61, 293.66],
      [65.41, 130.81, 196.0, 329.63],
      [55.0, 110.0, 164.81, 261.63],
    ];
    const sanctumHarp = [293.66, 440.0, 349.23, 329.63, 261.63, 392.0, 440.0, 329.63];
    const stepSec = 0.36;
    let beat = 0;
    let nextBeatTime = now + 0.2;

    const pumpSanctum = () => {
      if (!this.enabled || !this.ctx || !this.ambientNodes) return;
      while (nextBeatTime < this.ctx.currentTime + 0.45) {
        if (beat % 8 === 0) {
          const ci = Math.floor(beat / 8) % sanctumChords.length;
          this.playDarkStringChord(nextBeatTime, sanctumChords[ci], 0.075, 2.9);
        }
        if (beat % 4 === 0) {
          this.playTaikoHit(nextBeatTime, 0.14, 68);
        }
        const harpNote = sanctumHarp[beat % sanctumHarp.length];
        this.playArcanePluck(nextBeatTime, harpNote, 0.068, 1.15);
        if (beat % 4 === 2) {
          this.playArcanePluck(nextBeatTime, harpNote * 2, 0.036, 1.25);
        }
        nextBeatTime += stepSec;
        beat += 1;
      }
    };

    pumpSanctum();
    this.ambientMusicTimerId = window.setInterval(pumpSanctum, 120);
  }

  public stopAmbientLoop(): void {
    if (this.ambientMusicTimerId !== null) {
      window.clearInterval(this.ambientMusicTimerId);
      this.ambientMusicTimerId = null;
    }
    if (!this.ambientNodes || !this.ctx) return;
    const nodes = this.ambientNodes;
    this.ambientNodes = null;
    try {
      nodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      try {
        nodes.oscs.forEach((o) => {
          o.stop();
          o.disconnect();
        });
        nodes.lfo.stop();
        nodes.lfo.disconnect();
        nodes.noiseSrc.stop();
        nodes.noiseSrc.disconnect();
        nodes.gain.disconnect();
      } catch {
        // ignore
      }
    }, 350);
  }

  public dispose(): void {
    this.clearSequence();
    this.stopAmbientLoop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const soundEngine = new KuroganeSoundEngine();
