import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  BookmarkPlus,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Volume2,
} from 'lucide-react';
import { KuroganeEmblem } from './KuroganeEmblem';
import {
  computeRmsLevel,
  downsampleFloat32,
  float32ToPcm16Base64,
  LIVE_MODEL_ID,
  LIVE_VOICES,
  pcm16Base64ToFloat32,
  type LiveVoiceName,
} from '../lib/liveAudio';
import { soundEngine } from '../lib/soundEngine';

export interface LiveTranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface VoiceSanctumProps {
  sessionToken: string;
  systemPrompt: string;
  soundEnabled: boolean | null;
  onSaveChronicle: (turns: LiveTranscriptTurn[]) => void;
}

type ConnectionState = 'dormant' | 'connecting' | 'listening' | 'speaking' | 'error';

export const VoiceSanctum: React.FC<VoiceSanctumProps> = ({
  sessionToken,
  systemPrompt,
  soundEnabled,
  onSaveChronicle,
}) => {
  const [connState, setConnState] = useState<ConnectionState>('dormant');
  const [selectedVoice, setSelectedVoice] = useState<LiveVoiceName>('Charon');
  const [isMuted, setIsMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [whisperDraft, setWhisperDraft] = useState('');
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const isMutedRef = useRef(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const speakingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const stopQueuedOutputAudio = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore already-stopped nodes
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setOutputLevel(0);
  }, []);

  const cleanupResources = useCallback(() => {
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }

    stopQueuedOutputAudio();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop' }));
        }
        ws.close();
      } catch {
        // ignore
      }
    }

    setInputLevel(0);
    setOutputLevel(0);
    if (soundEnabled) {
      soundEngine.startAmbientLoop();
    }
  }, [soundEnabled, stopQueuedOutputAudio]);

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  const appendTranscriptChunk = useCallback((role: 'user' | 'assistant', chunkText: string) => {
    if (!chunkText) return;
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: last.text + chunkText, timestamp: Date.now() },
        ];
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          role,
          text: chunkText,
          timestamp: Date.now(),
        },
      ];
    });
  }, []);

  const schedulePcmPlayback = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const floatSamples = pcm16Base64ToFloat32(base64Audio);
    if (floatSamples.length === 0) return;

    setOutputLevel(computeRmsLevel(floatSamples));
    setConnState('speaking');
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
    }

    const buffer = ctx.createBuffer(1, floatSamples.length, 24000);
    buffer.copyToChannel(new Float32Array(floatSamples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.add(source);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        speakingTimerRef.current = window.setTimeout(() => {
          setOutputLevel(0);
          setConnState((cur) => (cur === 'speaking' ? 'listening' : cur));
        }, 180);
      }
    };
  }, []);

  const startSession = async () => {
    if (connState === 'connecting' || connState === 'listening' || connState === 'speaking') {
      return;
    }

    setErrorMsg(null);
    setConnState('connecting');
    setMicAvailable(true);

    // Pause background drone so it does not compete with live conversation
    soundEngine.stopAmbientLoop();

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      // Capture microphone if available (16kHz PCM)
      let micStream: MediaStream | null = null;
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } else {
          setMicAvailable(false);
        }
      } catch (micErr) {
        setMicAvailable(false);
        const msg = micErr instanceof Error ? micErr.message : 'Microphone access denied.';
        setErrorMsg(`Microphone unavailable (${msg}). You can still send text prompts below and hear voice replies.`);
      }

      if (micStream) {
        streamRef.current = micStream;
        const inputCtx = new AudioCtx({ sampleRate: 16000 });
        if (inputCtx.state === 'suspended') {
          await inputCtx.resume();
        }
        inputCtxRef.current = inputCtx;

        const source = inputCtx.createMediaStreamSource(micStream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        const silentGain = inputCtx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (event) => {
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN || isMutedRef.current) {
            setInputLevel(0);
            return;
          }
          const raw = event.inputBuffer.getChannelData(0);
          const pcm16k = downsampleFloat32(raw, inputCtx.sampleRate, 16000);
          setInputLevel(computeRmsLevel(pcm16k));
          const b64 = float32ToPcm16Base64(pcm16k);
          ws.send(JSON.stringify({ type: 'audio', data: b64 }));
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(inputCtx.destination);
        processorRef.current = processor;
      }

      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/api/live?session=${encodeURIComponent(sessionToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            voiceName: selectedVoice,
            systemInstruction: systemPrompt,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            text?: string;
            error?: string;
            reason?: string;
          };

          if (payload.type === 'ready') {
            setConnState('listening');
          } else if (payload.type === 'audio' && payload.data) {
            schedulePcmPlayback(payload.data);
          } else if (payload.type === 'inputTranscript' && payload.text) {
            appendTranscriptChunk('user', payload.text);
          } else if (payload.type === 'outputTranscript' && payload.text) {
            appendTranscriptChunk('assistant', payload.text);
          } else if (payload.type === 'interrupted') {
            stopQueuedOutputAudio();
            setConnState('listening');
          } else if (payload.type === 'turnComplete') {
            setConnState((cur) => (cur === 'speaking' && activeSourcesRef.current.size === 0 ? 'listening' : cur));
          } else if (payload.type === 'error') {
            setErrorMsg(payload.error || 'Live API session encountered an error.');
            setConnState('error');
            cleanupResources();
          } else if (payload.type === 'closed') {
            cleanupResources();
            setConnState((cur) => (cur === 'error' ? 'error' : 'dormant'));
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('Unable to establish WebSocket connection to Live Sanctum.');
        setConnState('error');
        cleanupResources();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          cleanupResources();
          setConnState((cur) => (cur === 'error' ? 'error' : 'dormant'));
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Live Voice session.';
      setErrorMsg(msg);
      setConnState('error');
      cleanupResources();
    }
  };

  const endSession = () => {
    cleanupResources();
    setConnState('dormant');
  };

  const sendWhisper = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = whisperDraft.trim();
    const ws = wsRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'text', text: trimmed }));
    setTurns((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
        timestamp: Date.now(),
      },
    ]);
    setWhisperDraft('');
  };

  const isActive = connState === 'connecting' || connState === 'listening' || connState === 'speaking';
  const activeEnergy = Math.max(inputLevel, outputLevel);
  const orbScale = 1 + activeEnergy * 0.24;

  const statusLabel =
    connState === 'connecting'
      ? 'Opening Live Conduit...'
      : connState === 'speaking'
        ? 'KUROGANE Speaking'
        : connState === 'listening'
          ? isMuted || !micAvailable
            ? 'Connected (Mic Muted)'
            : 'Listening — Speak Freely'
          : connState === 'error'
            ? 'Conduit Interrupted'
            : 'Voice Conduit Dormant';

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <AudioLines className="h-5 w-5 text-[#FF263F]" />
              <h1 className="font-display text-xl font-bold tracking-wider text-white">
                Voice Sanctum
              </h1>
              <span className="rounded border border-[#A40019]/50 bg-[#A40019]/15 px-2 py-0.5 font-mono-tabular text-[11px] text-[#ff7688]">
                {LIVE_MODEL_ID}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#8d8d98]">
              Real-time bidirectional voice communion over Gemini Live API (16kHz in / 24kHz out).
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <label htmlFor="live-voice-select" className="text-xs text-[#8d8d98]">
              Voice
            </label>
            <select
              id="live-voice-select"
              value={selectedVoice}
              disabled={isActive}
              onChange={(e) => setSelectedVoice(e.target.value as LiveVoiceName)}
              className="rounded-lg border border-white/10 bg-[#0b0b0e] px-3 py-1.5 text-xs text-white focus:border-[#FF263F] focus:outline-none disabled:opacity-50"
            >
              {LIVE_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.description}
                </option>
              ))}
            </select>
          </div>
        </header>

        {/* Resonance Core Stage */}
        <section className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0b0b0e]/85 px-6 py-8 text-center">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <div
              className={`absolute inset-0 rounded-full border border-[#A40019]/35 ${
                isActive ? 'animate-grimoire-slow' : ''
              }`}
              style={{
                transform: `scale(${orbScale})`,
                transition: 'transform 90ms ease-out',
                boxShadow: isActive
                  ? `0 0 ${28 + activeEnergy * 44}px rgba(255, 38, 63, ${0.22 + activeEnergy * 0.45})`
                  : 'none',
              }}
            />
            <div
              className={`absolute inset-4 rounded-full border border-dashed border-[#FF263F]/30 ${
                isActive ? 'animate-grimoire-reverse' : ''
              }`}
            />
            <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-[#111115]">
              <KuroganeEmblem size={56} glow={isActive} />
            </div>
          </div>

          <p className="mt-4 font-display text-sm font-semibold tracking-[0.2em] text-white uppercase">
            {statusLabel}
          </p>

          {/* Audio Levels */}
          {isActive && (
            <div className="mt-3 flex items-center gap-6 text-[11px] text-[#8d8d98]">
              <span className="inline-flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-[#FF263F]" />
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full bg-[#FF263F] transition-all duration-75"
                    style={{ width: `${Math.round(inputLevel * 100)}%` }}
                  />
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-[#C9C9D1]" />
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full bg-[#C9C9D1] transition-all duration-75"
                    style={{ width: `${Math.round(outputLevel * 100)}%` }}
                  />
                </span>
              </span>
            </div>
          )}

          {/* Primary Call Controls */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {!isActive ? (
              <button
                type="button"
                onClick={startSession}
                className="inline-flex items-center gap-2 rounded-lg border border-[#FF263F]/75 bg-[#A40019] px-6 py-2.5 text-xs font-semibold tracking-wider text-white uppercase shadow-[0_0_24px_rgba(164,0,25,0.45)] transition-colors hover:bg-[#c2001e] whitespace-nowrap shrink-0"
              >
                <Mic className="h-4 w-4" />
                <span>Awaken Voice Link</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  disabled={!micAvailable}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                    isMuted || !micAvailable
                      ? 'border-white/20 bg-white/10 text-[#C9C9D1]'
                      : 'border-[#A40019]/70 bg-[#111115] text-white hover:border-[#FF263F]'
                  }`}
                >
                  {isMuted || !micAvailable ? (
                    <MicOff className="h-4 w-4 text-[#FF263F]" />
                  ) : (
                    <Mic className="h-4 w-4 text-[#FF263F]" />
                  )}
                  <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                </button>

                <button
                  type="button"
                  onClick={endSession}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#FF263F]/60 bg-[#A40019]/25 px-5 py-2.5 text-xs font-semibold tracking-wider text-white uppercase transition-colors hover:bg-[#A40019]/45 whitespace-nowrap shrink-0"
                >
                  <PhoneOff className="h-4 w-4 text-[#FF263F]" />
                  <span>Sever Link</span>
                </button>
              </>
            )}

            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => onSaveChronicle(turns)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#111115] px-4 py-2.5 text-xs font-medium text-[#C9C9D1] transition-colors hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
              >
                <BookmarkPlus className="h-4 w-4 text-[#FF263F]" />
                <span>Save to Chronicles</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="mt-5 flex max-w-xl items-start gap-2.5 rounded-xl border border-[#A40019]/70 bg-[#A40019]/15 px-4 py-3 text-left text-xs text-[#ffd7dc]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF263F]" />
              <p className="break-words">{errorMsg}</p>
            </div>
          )}
        </section>

        {/* Live Transcript Feed + Text Whisper */}
        <section className="flex min-h-[240px] flex-1 flex-col rounded-2xl border border-white/[0.08] bg-[#0b0b0e]/70">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <h2 className="font-display text-xs font-semibold tracking-[0.18em] text-[#C9C9D1] uppercase">
              Live Resonance Transcript
            </h2>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => setTurns([])}
                className="text-[11px] text-[#777780] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-72">
            {turns.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#6f6f78]">
                Awaken the voice link above and speak—live transcripts from you and KUROGANE will appear here.
              </p>
            ) : (
              turns.map((t) => (
                <div
                  key={t.id}
                  className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-xl px-4 py-2.5 text-sm ${
                      t.role === 'user'
                        ? 'border border-white/10 bg-[#17171d] text-white'
                        : 'border border-[#A40019]/35 bg-[#111115] text-[#d8d8e2]'
                    }`}
                  >
                    <span className="mb-1 block font-display text-[10px] tracking-[0.18em] text-[#8d8d98] uppercase">
                      {t.role === 'user' ? 'You' : 'KUROGANE'}
                    </span>
                    <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          <form
            onSubmit={sendWhisper}
            className="flex items-center gap-2 border-t border-white/[0.07] p-3"
          >
            <label htmlFor="live-whisper-input" className="sr-only">
              Send text prompt to live session
            </label>
            <input
              id="live-whisper-input"
              type="text"
              value={whisperDraft}
              disabled={!isActive}
              onChange={(e) => setWhisperDraft(e.target.value)}
              placeholder={
                isActive
                  ? 'Type a prompt into the live voice session...'
                  : 'Awaken Voice Link to send live audio or text...'
              }
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#050505] px-3 py-2 text-xs text-white placeholder-[#6d6d76] focus:border-[#FF263F] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isActive || !whisperDraft.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#A40019] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c2001e] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#6f6f78] whitespace-nowrap shrink-0"
            >
              <span>Send</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
