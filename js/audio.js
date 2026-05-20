let audioContext = null;
let masterGain = null;

const SOUND_PRESETS = {
  tap: [
    { type: "triangle", frequency: 360, duration: 0.045, gain: 0.035 },
    { type: "sine", frequency: 520, delay: 0.035, duration: 0.055, gain: 0.025 }
  ],
  launch: [
    { type: "sawtooth", frequency: 180, duration: 0.09, gain: 0.04 },
    { type: "triangle", frequency: 300, delay: 0.075, duration: 0.12, gain: 0.04 }
  ],
  reward: [
    { type: "sine", frequency: 523.25, duration: 0.08, gain: 0.035 },
    { type: "sine", frequency: 659.25, delay: 0.08, duration: 0.09, gain: 0.035 },
    { type: "sine", frequency: 783.99, delay: 0.17, duration: 0.12, gain: 0.032 }
  ],
  upgrade: [
    { type: "triangle", frequency: 392, duration: 0.08, gain: 0.035 },
    { type: "triangle", frequency: 587.33, delay: 0.075, duration: 0.1, gain: 0.035 }
  ],
  danger: [
    { type: "square", frequency: 155, duration: 0.1, gain: 0.03 },
    { type: "square", frequency: 116.54, delay: 0.1, duration: 0.12, gain: 0.03 }
  ],
  gacha: [
    { type: "triangle", frequency: 440, duration: 0.06, gain: 0.03 },
    { type: "triangle", frequency: 554.37, delay: 0.06, duration: 0.07, gain: 0.03 },
    { type: "triangle", frequency: 880, delay: 0.14, duration: 0.14, gain: 0.035 }
  ]
};

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(audioContext.destination);
  return audioContext;
}

export function playSound(name, state) {
  if (!state?.settings?.sound) return;
  const context = getAudioContext();
  if (!context || !masterGain) return;

  if (context.state === "suspended") {
    void context.resume();
  }

  const preset = SOUND_PRESETS[name] ?? SOUND_PRESETS.tap;
  const start = context.currentTime;

  for (const note of preset) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + (note.delay ?? 0);
    const noteEnd = noteStart + note.duration;

    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  }
}
