import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Check,
  Edit2,
  Flame,
  KeyRound,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AwakeningScene } from './components/AwakeningScene';
import { ApiVault, type VaultStatusResponse } from './components/ApiVault';
import { ChatWorkspace } from './components/ChatWorkspace';
import { KuroganeEmblem } from './components/KuroganeEmblem';
import { Observatory } from './components/Observatory';
import { ParticleBackground } from './components/ParticleBackground';
import { TheForge } from './components/TheForge';
import { VoiceSanctum, type LiveTranscriptTurn } from './components/VoiceSanctum';
import {
  DEFAULT_FORGE_CONFIG,
  deriveConversationTitle,
  estimateTokenCount,
  filterAndSortConversations,
  getModelSpec,
  MODEL_CATALOG,
  type ChatMessage,
  type Conversation,
  type ForgeConfig,
  type PricingOverride,
  type UsageRecord,
} from './lib/kuroganeLogic';
import { LIVE_MODEL_ID } from './lib/liveAudio';
import { soundEngine } from './lib/soundEngine';

type WorkspaceView = 'chat' | 'voice' | 'forge' | 'vault' | 'observatory';

const STORAGE_KEYS = {
  CONVERSATIONS: 'kurogane_conversations_v1',
  ACTIVE_ID: 'kurogane_active_conv_v1',
  FORGE: 'kurogane_forge_v1',
  USAGE: 'kurogane_usage_v1',
  PRICING: 'kurogane_pricing_v1',
  SOUND_PREF: 'kurogane_sound_pref_v1',
  SOUND_VOL: 'kurogane_sound_vol_v1',
  PARTICLES: 'kurogane_particles_v1',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

class KuroganeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected interface error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#050505] px-6 text-center text-[#C9C9D1]">
          <KuroganeEmblem size={56} />
          <h1 className="font-display mt-4 text-xl font-semibold text-white">
            The Blade Encountered a Fracture
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#8d8d98]">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-[#A40019] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#c2001e]"
          >
            Re-Awaken KUROGANE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function KuroganeApp() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [enteredWorld, setEnteredWorld] = useState<boolean>(autostart);
  const [activeView, setActiveView] = useState<WorkspaceView>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // Sound & Visual preferences
  const [soundPref, setSoundPref] = useState<boolean | null>(() =>
    loadJson<boolean | null>(STORAGE_KEYS.SOUND_PREF, null),
  );
  const [soundVolume, setSoundVolume] = useState<number>(() =>
    loadJson<number>(STORAGE_KEYS.SOUND_VOL, 0.65),
  );
  const [particlesEnabled, setParticlesEnabled] = useState<boolean>(() =>
    loadJson<boolean>(STORAGE_KEYS.PARTICLES, true),
  );

  // Conversations & Analytics
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadJson<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []),
  );
  const [activeConvId, setActiveConvId] = useState<string | null>(() =>
    loadJson<string | null>(STORAGE_KEYS.ACTIVE_ID, null),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [forgeConfig, setForgeConfig] = useState<ForgeConfig>(() =>
    loadJson<ForgeConfig>(STORAGE_KEYS.FORGE, DEFAULT_FORGE_CONFIG),
  );
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>(() =>
    loadJson<UsageRecord[]>(STORAGE_KEYS.USAGE, []),
  );
  const [pricingOverrides, setPricingOverrides] = useState<Record<string, PricingOverride>>(() =>
    loadJson<Record<string, PricingOverride>>(STORAGE_KEYS.PRICING, {}),
  );

  // Server-side Session Vault state (held strictly in React memory)
  const [sessionToken, setSessionToken] = useState('');
  const [vaultStatus, setVaultStatus] = useState<VaultStatusResponse | null>(null);

  // Streaming control
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist local non-secret state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    } catch {
      // ignore quota errors
    }
  }, [conversations]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, JSON.stringify(activeConvId));
    } catch {
      // ignore
    }
  }, [activeConvId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FORGE, JSON.stringify(forgeConfig));
    } catch {
      // ignore
    }
  }, [forgeConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify(usageRecords));
    } catch {
      // ignore
    }
  }, [usageRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRICING, JSON.stringify(pricingOverrides));
    } catch {
      // ignore
    }
  }, [pricingOverrides]);

  useEffect(() => {
    soundEngine.setVolume(soundVolume);
    try {
      localStorage.setItem(STORAGE_KEYS.SOUND_VOL, JSON.stringify(soundVolume));
    } catch {
      // ignore
    }
  }, [soundVolume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PARTICLES, JSON.stringify(particlesEnabled));
    } catch {
      // ignore
    }
  }, [particlesEnabled]);

  const handleSoundPrefChange = useCallback(async (enabled: boolean) => {
    setSoundPref(enabled);
    try {
      localStorage.setItem(STORAGE_KEYS.SOUND_PREF, JSON.stringify(enabled));
    } catch {
      // ignore
    }
    if (enabled) {
      const ok = await soundEngine.enable(soundVolume);
      if (ok && enteredWorld) {
        soundEngine.startAmbientLoop();
      }
    } else {
      soundEngine.disable();
    }
  }, [soundVolume, enteredWorld]);

  const refreshVault = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers['X-Kurogane-Session'] = sessionToken;
      const res = await fetch('/api/vault/status', { headers });
      if (!res.ok) return;
      const data = (await res.json()) as VaultStatusResponse;
      setSessionToken(data.sessionToken);
      setVaultStatus(data);
    } catch {
      // ignore initial offline probe
    }
  }, [sessionToken]);

  useEffect(() => {
    refreshVault();
  }, [refreshVault]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConvId) ?? null,
    [conversations, activeConvId],
  );

  const visibleConversations = useMemo(
    () => filterAndSortConversations(conversations, searchQuery),
    [conversations, searchQuery],
  );

  const triggerNewChatUnsheathe = useCallback(() => {
    if (soundPref === false) return;
    if (soundEngine.isEnabled()) {
      soundEngine.playUnsheathe();
      return;
    }
    if (soundPref === true) {
      void soundEngine.enable(soundVolume).then((ok) => {
        if (ok) soundEngine.playUnsheathe();
      });
    }
  }, [soundPref, soundVolume]);

  const createNewConversation = () => {
    if (isStreaming) return;
    triggerNewChatUnsheathe();
    setActiveConvId(null);
    setActiveView('chat');
    setMobileMenuOpen(false);
  };

  const deleteConversation = (id: string) => {
    if (isStreaming && activeConvId === id) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
    }
  };

  const commitRename = (id: string) => {
    const clean = renameDraft.trim();
    if (clean) {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: clean, updatedAt: Date.now() } : c)),
      );
    }
    setRenamingId(null);
  };

  const dispatchChatCompletion = async (
    convId: string,
    convTitle: string,
    historyForRequest: Array<{ role: 'user' | 'assistant'; content: string }>,
    assistantMsgId: string,
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['X-Kurogane-Session'] = sessionToken;

    const modelUsed =
      forgeConfig.provider === 'custom' && forgeConfig.customModelName?.trim()
        ? forgeConfig.customModelName.trim()
        : forgeConfig.modelId;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: historyForRequest,
          config: forgeConfig,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errPayload.error || `Request failed with status ${response.status}.`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let finalUsage:
          | { inputTokens: number; outputTokens: number; isExact: boolean }
          | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as {
                type: 'delta' | 'done' | 'error';
                text?: string;
                error?: string;
                usage?: { inputTokens: number; outputTokens: number; isExact: boolean };
              };

              if (event.type === 'delta' && event.text) {
                accumulated += event.text;
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === convId
                      ? {
                          ...c,
                          updatedAt: Date.now(),
                          messages: c.messages.map((m) =>
                            m.id === assistantMsgId ? { ...m, content: accumulated } : m,
                          ),
                        }
                      : c,
                  ),
                );
              } else if (event.type === 'error') {
                throw new Error(event.error || 'Stream interrupted.');
              } else if (event.type === 'done' && event.usage) {
                finalUsage = event.usage;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                if (parseErr.message.includes('Stream') || !parseErr.message.includes('JSON')) {
                  throw parseErr;
                }
              }
            }
          }
        }

        const resolvedUsage = finalUsage ?? {
          inputTokens: estimateTokenCount(
            historyForRequest.map((m) => m.content).join('\n'),
            forgeConfig.provider,
          ),
          outputTokens: estimateTokenCount(accumulated, forgeConfig.provider),
          isExact: false,
        };

        const finalContent = accumulated.trim();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? finalContent
                        ? {
                            ...m,
                            content: accumulated,
                            inputTokens: resolvedUsage.inputTokens,
                            outputTokens: resolvedUsage.outputTokens,
                            isExactTokens: resolvedUsage.isExact,
                          }
                        : {
                            ...m,
                            error: 'No response text was returned by the provider.',
                          }
                      : m,
                  ),
                }
              : c,
          ),
        );

        setUsageRecords((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            conversationId: convId,
            conversationTitle: convTitle,
            provider: forgeConfig.provider,
            modelId: modelUsed,
            inputTokens: resolvedUsage.inputTokens,
            outputTokens: resolvedUsage.outputTokens,
            isExact: resolvedUsage.isExact,
            timestamp: Date.now(),
          },
        ]);
      } else {
        const data = (await response.json()) as {
          text: string;
          usage: { inputTokens: number; outputTokens: number; isExact: boolean };
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: data.text,
                          inputTokens: data.usage.inputTokens,
                          outputTokens: data.usage.outputTokens,
                          isExactTokens: data.usage.isExact,
                        }
                      : m,
                  ),
                }
              : c,
          ),
        );

        setUsageRecords((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            conversationId: convId,
            conversationTitle: convTitle,
            provider: forgeConfig.provider,
            modelId: modelUsed,
            inputTokens: data.usage.inputTokens,
            outputTokens: data.usage.outputTokens,
            isExact: data.usage.isExact,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const errMsg = err instanceof Error ? err.message : 'Unable to reach AI provider.';
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, error: errMsg } : m,
                ),
              }
            : c,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (content: string) => {
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: now,
    };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      modelId: forgeConfig.modelId,
      provider: forgeConfig.provider,
    };

    let targetConvId = activeConvId;
    let targetTitle = activeConversation?.title ?? deriveConversationTitle(content);
    let historyPayload: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (!targetConvId || !activeConversation) {
      triggerNewChatUnsheathe();
      targetConvId = crypto.randomUUID();
      const newConv: Conversation = {
        id: targetConvId,
        title: targetTitle,
        createdAt: now,
        updatedAt: now,
        messages: [userMsg, assistantMsg],
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(targetConvId);
      historyPayload = [{ role: 'user', content }];
    } else {
      historyPayload = [
        ...activeConversation.messages
          .filter((m) => !m.error && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? {
                ...c,
                updatedAt: now,
                messages: [...c.messages, userMsg, assistantMsg],
              }
            : c,
        ),
      );
    }

    await dispatchChatCompletion(targetConvId, targetTitle, historyPayload, assistantMsg.id);
  };

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const handleRegenerate = async (assistantMsgId: string) => {
    if (!activeConversation || isStreaming) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx === -1) return;

    const priorMessages = activeConversation.messages.slice(0, idx);
    const historyPayload = priorMessages
      .filter((m) => !m.error && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    const newAssistantId = crypto.randomUUID();
    const freshAssistant: ChatMessage = {
      id: newAssistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelId: forgeConfig.modelId,
      provider: forgeConfig.provider,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? { ...c, updatedAt: Date.now(), messages: [...priorMessages, freshAssistant] }
          : c,
      ),
    );

    await dispatchChatCompletion(
      activeConversation.id,
      activeConversation.title,
      historyPayload,
      newAssistantId,
    );
  };

  const handleEditAndResend = async (userMsgId: string, newContent: string) => {
    if (!activeConversation || isStreaming) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === userMsgId);
    if (idx === -1) return;

    const prior = activeConversation.messages.slice(0, idx);
    const updatedUser: ChatMessage = {
      ...activeConversation.messages[idx],
      content: newContent,
      createdAt: Date.now(),
    };
    const freshAssistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      modelId: forgeConfig.modelId,
      provider: forgeConfig.provider,
    };

    const historyPayload = [...prior, updatedUser]
      .filter((m) => !m.error && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...prior, updatedUser, freshAssistant],
            }
          : c,
      ),
    );

    await dispatchChatCompletion(
      activeConversation.id,
      activeConversation.title,
      historyPayload,
      freshAssistant.id,
    );
  };

  const handleSaveVoiceChronicle = (turns: LiveTranscriptTurn[]) => {
    const validTurns = turns.filter((t) => t.text.trim().length > 0);
    if (validTurns.length === 0) return;

    const firstUser = validTurns.find((t) => t.role === 'user')?.text ?? validTurns[0].text;
    const now = Date.now();
    const convId = crypto.randomUUID();
    const messages: ChatMessage[] = validTurns.map((t) => ({
      id: t.id,
      role: t.role,
      content: t.text.trim(),
      createdAt: t.timestamp,
      modelId: t.role === 'assistant' ? LIVE_MODEL_ID : undefined,
      provider: t.role === 'assistant' ? 'gemini' : undefined,
    }));

    const voiceConv: Conversation = {
      id: convId,
      title: `Voice: ${deriveConversationTitle(firstUser)}`,
      createdAt: now,
      updatedAt: now,
      messages,
    };

    setConversations((prev) => [voiceConv, ...prev]);
    setActiveConvId(convId);
    setActiveView('chat');
  };

  const navItems: Array<{ id: WorkspaceView; label: string; icon: React.ReactNode }> = [
    { id: 'chat', label: 'Sanctum Chat', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'voice', label: 'Voice Sanctum', icon: <AudioLines className="h-4 w-4" /> },
    { id: 'observatory', label: 'The Observatory', icon: <Activity className="h-4 w-4" /> },
    { id: 'forge', label: 'The Forge', icon: <Flame className="h-4 w-4" /> },
    { id: 'vault', label: 'API Vault', icon: <KeyRound className="h-4 w-4" /> },
  ];

  const renderSidebarBody = (isMobile: boolean) => (
    <div className="flex h-full flex-col bg-[#0b0b0e] text-[#C9C9D1]">
      {/* Brand Row */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-4">
        <button
          type="button"
          onClick={() => {
            setActiveView('chat');
            if (isMobile) setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2.5 text-left"
        >
          <KuroganeEmblem size={28} glow />
          <span className="font-display text-base font-bold tracking-[0.22em] text-white">
            KUROGANE
          </span>
        </button>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-[#8d8d98] hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Collapse sidebar"
            className="rounded-lg p-1.5 text-[#8d8d98] hover:bg-white/5 hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New Conversation + Search */}
      <div className="space-y-2.5 p-3">
        <button
          type="button"
          onClick={createNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#A40019]/70 bg-[#A40019]/20 px-3.5 py-2.5 text-xs font-semibold tracking-wider text-white uppercase transition-colors hover:bg-[#A40019]/40"
        >
          <Plus className="h-4 w-4 text-[#FF263F]" />
          <span>New Conversation</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#777780]" />
          <label htmlFor={`conv-search-${isMobile ? 'm' : 'd'}`} className="sr-only">
            Search conversations
          </label>
          <input
            id={`conv-search-${isMobile ? 'm' : 'd'}`}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chronicles..."
            className="w-full rounded-lg border border-white/10 bg-[#050505] py-2 pl-8 pr-3 text-xs text-white placeholder-[#6d6d76] focus:border-[#FF263F]/60 focus:outline-none"
          />
        </div>
      </div>

      {/* Conversation History List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wider text-[#6f6f78] uppercase">
          Chronicles
        </p>
        {visibleConversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[#6f6f78]">
            {searchQuery ? 'No matching conversations.' : 'No saved conversations yet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {visibleConversations.map((conv) => {
              const isSelected = conv.id === activeConvId && activeView === 'chat';
              return (
                <li key={conv.id} className="group">
                  {renamingId === conv.id ? (
                    <div className="flex items-center gap-1 rounded-lg border border-[#FF263F]/60 bg-[#111115] px-2 py-1.5">
                      <label htmlFor={`rename-${conv.id}`} className="sr-only">
                        Rename conversation
                      </label>
                      <input
                        id={`rename-${conv.id}`}
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(conv.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(conv.id)}
                        aria-label={`Save name for ${conv.title}`}
                        className="p-1 text-[#FF263F] hover:text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        isSelected
                          ? 'bg-[#171319] text-white border border-[#A40019]/50'
                          : 'text-[#b5b5c0] hover:bg-white/[0.04] hover:text-white border border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveConvId(conv.id);
                          setActiveView('chat');
                          if (isMobile) setMobileMenuOpen(false);
                        }}
                        className="min-w-0 flex-1 truncate text-left"
                      >
                        {conv.title}
                      </button>
                      <div className="flex items-center gap-0.5 opacity-75 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(conv.id);
                            setRenameDraft(conv.title);
                          }}
                          aria-label={`Rename ${conv.title}`}
                          className="rounded p-1 text-[#777780] hover:bg-white/10 hover:text-white"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteConversation(conv.id)}
                          aria-label={`Delete ${conv.title}`}
                          className="rounded p-1 text-[#777780] hover:bg-[#A40019]/30 hover:text-[#FF263F]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Model Selector + Navigation + Sound/Appearance */}
      <div className="space-y-3 border-t border-white/[0.08] p-3">
        <div>
          <label
            htmlFor={`sidebar-model-${isMobile ? 'm' : 'd'}`}
            className="block text-[11px] font-medium tracking-wider text-[#777780] uppercase"
          >
            Active Intelligence
          </label>
          <select
            id={`sidebar-model-${isMobile ? 'm' : 'd'}`}
            value={forgeConfig.modelId}
            onChange={(e) => {
              const spec = getModelSpec(e.target.value);
              setForgeConfig((prev) => ({
                ...prev,
                provider: spec.provider,
                modelId: spec.id,
              }));
            }}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#050505] px-2.5 py-1.5 text-xs text-white focus:border-[#FF263F] focus:outline-none"
          >
            {MODEL_CATALOG.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="space-y-1" aria-label="Workspace sections">
          {navItems.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveView(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#A40019]/25 text-white border border-[#A40019]/60'
                    : 'text-[#a3a3ae] hover:bg-white/[0.04] hover:text-white border border-transparent'
                }`}
              >
                <span className={active ? 'text-[#FF263F]' : 'text-[#777780]'}>{item.icon}</span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setAppearanceOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-[#111115] px-3 py-2 text-xs text-[#C9C9D1] hover:border-white/25 hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            {soundPref ? (
              <Volume2 className="h-3.5 w-3.5 text-[#FF263F]" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-[#777780]" />
            )}
            <span>Sound & Appearance</span>
          </span>
          <Sparkles className="h-3.5 w-3.5 text-[#777780]" />
        </button>

        {appearanceOpen && (
          <div className="space-y-2.5 rounded-lg border border-white/10 bg-[#050505] p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#9e9ea9]">Cinematic Audio</span>
              <button
                type="button"
                onClick={() => handleSoundPrefChange(!soundPref)}
                className={`rounded px-2 py-0.5 font-medium ${
                  soundPref ? 'bg-[#A40019] text-white' : 'bg-white/10 text-[#9e9ea9]'
                }`}
              >
                {soundPref ? 'On' : 'Off'}
              </button>
            </div>
            <div>
              <label htmlFor="sound-vol" className="flex justify-between text-[11px] text-[#777780]">
                <span>Volume</span>
                <span className="font-mono-tabular">{Math.round(soundVolume * 100)}%</span>
              </label>
              <input
                id="sound-vol"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={soundVolume}
                onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                className="mt-1 w-full accent-[#A40019]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#9e9ea9]">Ember Particles</span>
              <button
                type="button"
                onClick={() => setParticlesEnabled((v) => !v)}
                className={`rounded px-2 py-0.5 font-medium ${
                  particlesEnabled ? 'bg-[#A40019] text-white' : 'bg-white/10 text-[#9e9ea9]'
                }`}
              >
                {particlesEnabled ? 'Active' : 'Off'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setAppearanceOpen(false);
                setMobileMenuOpen(false);
                if (soundPref) {
                  soundEngine.stopAmbientLoop();
                  soundEngine.playAwakeningSequence(0);
                }
                setEnteredWorld(false);
              }}
              className="w-full rounded-md border border-white/15 py-1.5 text-[11px] font-medium text-[#C9C9D1] hover:border-[#FF263F]/50 hover:text-white"
            >
              Replay Awakening Intro
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const activeProviderStatus = vaultStatus?.providers[forgeConfig.provider];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050505] text-[#C9C9D1]">
      <AnimatePresence>
        {!enteredWorld && (
          <motion.div
            key="awakening-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 bg-[#050505]"
          >
            <AwakeningScene
              initialSoundPref={soundPref}
              onSoundPrefChange={handleSoundPrefChange}
              onComplete={() => setEnteredWorld(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {enteredWorld && (
        <motion.div
          key="kurogane-workspace"
          initial={autostart ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex h-full w-full overflow-hidden bg-[#050505] text-[#C9C9D1]"
        >
          {particlesEnabled && <ParticleBackground intensity={isStreaming ? 'active' : 'subtle'} />}

          {/* Desktop Sidebar */}
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-20 hidden h-full shrink-0 overflow-hidden border-r border-white/[0.08] md:block"
          >
            <div className="h-full w-[272px]">{renderSidebarBody(false)}</div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex md:hidden"
          >
            <div
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-50 h-full w-72 border-r border-white/10"
            >
              {renderSidebarBody(true)}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Stage */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Clean Top Workspace Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] bg-[#050505]/90 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-1.5 text-[#9e9ea9] hover:bg-white/5 hover:text-white md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Expand sidebar"
                className="hidden rounded-lg p-1.5 text-[#9e9ea9] hover:bg-white/5 hover:text-white md:inline-flex"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <span className="truncate font-display text-sm font-semibold tracking-wider text-white">
              {activeView === 'chat'
                ? activeConversation?.title || 'Sanctum'
                : activeView === 'voice'
                  ? 'Voice Sanctum'
                  : activeView === 'forge'
                    ? 'The Forge'
                    : activeView === 'vault'
                      ? 'API Vault'
                      : 'The Observatory'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setActiveView('vault')}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b0b0e] px-3 py-1.5 text-xs text-[#C9C9D1] transition-colors hover:border-[#FF263F]/50 hover:text-white whitespace-nowrap shrink-0"
            >
              <span>
                {activeProviderStatus?.connected
                  ? `${forgeConfig.provider.toUpperCase()} Ready`
                  : `${forgeConfig.provider.toUpperCase()} Unconfigured`}
              </span>
            </button>
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="min-h-0 flex-1 overflow-hidden">
          {activeView === 'chat' && (
            <ChatWorkspace
              conversation={activeConversation}
              config={forgeConfig}
              isStreaming={isStreaming}
              onSendMessage={handleSendMessage}
              onStopGeneration={handleStopGeneration}
              onRegenerate={handleRegenerate}
              onEditAndResend={handleEditAndResend}
              onOpenForge={() => setActiveView('forge')}
              onOpenVoice={() => setActiveView('voice')}
            />
          )}
          {activeView === 'voice' && (
            <VoiceSanctum
              sessionToken={sessionToken}
              systemPrompt={forgeConfig.systemPrompt}
              soundEnabled={soundPref}
              onSaveChronicle={handleSaveVoiceChronicle}
            />
          )}
          {activeView === 'forge' && (
            <TheForge config={forgeConfig} onChange={setForgeConfig} />
          )}
          {activeView === 'vault' && (
            <ApiVault
              vaultStatus={vaultStatus}
              config={forgeConfig}
              onConfigChange={setForgeConfig}
              onRefreshVault={refreshVault}
              sessionToken={sessionToken}
            />
          )}
          {activeView === 'observatory' && (
            <Observatory
              usageRecords={usageRecords}
              pricingOverrides={pricingOverrides}
              onUpdatePricing={setPricingOverrides}
              onClearAnalytics={() => setUsageRecords([])}
              sessionToken={sessionToken}
            />
          )}
        </main>
      </div>
        </motion.div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <KuroganeErrorBoundary>
      <KuroganeApp />
    </KuroganeErrorBoundary>
  );
}
