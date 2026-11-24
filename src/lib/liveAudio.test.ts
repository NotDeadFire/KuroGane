import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRmsLevel,
  downsampleFloat32,
  float32ToPcm16Base64,
  isAllowedLiveVoice,
  LIVE_MODEL_ID,
  pcm16Base64ToFloat32,
} from './liveAudio';

test('float32ToPcm16Base64 and pcm16Base64ToFloat32 round-trip little-endian PCM accurately', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
  const b64 = float32ToPcm16Base64(input);
  const decoded = pcm16Base64ToFloat32(b64);

  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.001, `Mismatch at ${i}: ${decoded[i]} vs ${input[i]}`);
  }
});

test('downsampleFloat32 reduces 48kHz samples cleanly to 16kHz', () => {
  const input = new Float32Array(480);
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((i / 480) * Math.PI * 2);
  }
  const down = downsampleFloat32(input, 48000, 16000);
  assert.equal(down.length, 160);
  assert.equal(downsampleFloat32(input, 16000, 16000), input);
});

test('computeRmsLevel returns 0 for silence and bounded level for signal', () => {
  assert.equal(computeRmsLevel(new Float32Array(0)), 0);
  assert.equal(computeRmsLevel(new Float32Array([0, 0, 0])), 0);
  const level = computeRmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]));
  assert.ok(level > 0.5 && level <= 1);
});

test('LIVE_MODEL_ID and voice allowlist match Gemini Live API requirements', () => {
  assert.equal(LIVE_MODEL_ID, 'gemini-3.8-live');
  assert.equal(isAllowedLiveVoice('Charon'), true);
  assert.equal(isAllowedLiveVoice('Fenrir'), true);
  assert.equal(isAllowedLiveVoice('UnknownVoice'), false);
});
