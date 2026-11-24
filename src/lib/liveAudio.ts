export const LIVE_MODEL_ID = 'gemini-3.8-live' as const;

export const LIVE_VOICES = [
  { id: 'Charon', label: 'Charon', description: 'Deep, calm steel resonance' },
  { id: 'Fenrir', label: 'Fenrir', description: 'Fierce, commanding presence' },
  { id: 'Kore', label: 'Kore', description: 'Poised, crystalline clarity' },
  { id: 'Zephyr', label: 'Zephyr', description: 'Smooth, measured cadence' },
  { id: 'Puck', label: 'Puck', description: 'Quick, incisive wit' },
] as const;

export type LiveVoiceName = (typeof LIVE_VOICES)[number]['id'];

export function isAllowedLiveVoice(value: unknown): value is LiveVoiceName {
  return typeof value === 'string' && LIVE_VOICES.some((v) => v.id === value);
}

/**
 * Downsamples Float32 PCM audio to targetRate (16kHz for Gemini Live input).
 */
export function downsampleFloat32(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000,
): Float32Array {
  if (inputSampleRate <= targetSampleRate || input.length === 0) {
    return input;
  }
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const result = new Float32Array(outputLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < outputLength) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Encodes Float32 (-1..1) samples as little-endian 16-bit signed PCM base64.
 */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decodes little-endian 16-bit signed PCM base64 into normalized Float32 (-1..1) samples.
 */
export function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = byteLength / 2;
  const output = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    output[i] = view.getInt16(i * 2, true) / 32768;
  }
  return output;
}

/**
 * Returns normalized RMS amplitude [0..1] for live visual waveform metering.
 */
export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.min(1, Math.sqrt(sumSq / samples.length) * 3.2);
}
