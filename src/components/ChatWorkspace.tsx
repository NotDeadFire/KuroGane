import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  AudioLines,
  Check,
  Copy,
  Edit3,
  RefreshCw,
  Send,
  Sliders,
  Square,
  X,
} from 'lucide-react';
import {
  estimateTokenCount,
  getModelSpec,
  SUGGESTION_CARDS,
  type ChatMessage,
  type Conversation,
  type ForgeConfig,
} from '../lib/kuroganeLogic';
import { KuroganeEmblem } from './KuroganeEmblem';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatWorkspaceProps {
  conversation: Conversation | null;
  config: ForgeConfig;
  isStreaming: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  onRegenerate: (assistantMsgId: string) => void;
  onEditAndResend: (userMsgId: string, newContent: string) => void;
  onOpenForge: () => void;
  onOpenVoice?: () => void;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  conversation,
  config,
  isStreaming,
  onSendMessage,
  onStopGeneration,
  onRegenerate,
  onEditAndResend,
  onOpenForge,
  onOpenVoice,
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);

  const activeModel = getModelSpec(config.modelId);
  const messages = conversation?.messages ?? [];
  const isWelcome = messages.length === 0;
  const draftTokens = estimateTokenCount(input, config.provider);

  const scrollToBottom = (smooth = true) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    stickToBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom && messages.length > 0);
  };

  const submitPrompt = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    stickToBottomRef.current = true;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitPrompt(input);
    }
  };

  const handleCopy = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const startEditing = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditDraft(msg.content);
  };

  const saveEdit = (msgId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    setEditingId(null);
    onEditAndResend(msgId, trimmed);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Message Scroll Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        {isWelcome ? (
          <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center py-8">
            <div className="relative mb-6 flex items-center justify-center">
              <div
                className="animate-grimoire-slow absolute h-28 w-28 rounded-full border border-[#A40019]/30 border-dashed"
                aria-hidden="true"
              />
              <KuroganeEmblem size={64} glow />
            </div>

            <h2 className="font-display text-center text-2xl sm:text-3xl font-semibold tracking-[0.22em] text-white uppercase">
              THE BLADE IS READY.
            </h2>
            <p className="mt-2.5 text-center text-base text-[#8d8d98]">
              What knowledge shall we seek today?
            </p>

            {/* 6 Interactive Suggestion Cards */}
            <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SUGGESTION_CARDS.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => submitPrompt(card.prompt)}
                  className="blade-border-glow group flex flex-col items-start rounded-xl bg-[#111115]/90 p-4 text-left transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <span className="text-sm font-semibold text-[#e6e6ee] transition-colors group-hover:text-white">
                    {card.title}
                  </span>
                  <span className="mt-1.5 text-xs leading-relaxed text-[#777780]">
                    {card.subtitle}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-8 text-center font-display text-xs tracking-[0.18em] text-[#6d6d76] uppercase">
              Some blades are forged to fight. This one was forged to understand.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isLast = idx === messages.length - 1;
              const isCurrentlyStreaming = isStreaming && isLast && !isUser;

              return (
                <article
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {isUser ? (
                    <div className="w-full max-w-[85%] sm:max-w-[78%]">
                      {editingId === msg.id ? (
                        <div className="rounded-xl border border-[#A40019]/60 bg-[#111115] p-3">
                          <label htmlFor={`edit-${msg.id}`} className="sr-only">
                            Edit message
                          </label>
                          <textarea
                            id={`edit-${msg.id}`}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={3}
                            className="w-full resize-none bg-transparent text-sm text-white focus:outline-none"
                          />
                          <div className="mt-2.5 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#C9C9D1] hover:bg-white/5"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Cancel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(msg.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#A40019] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c2001e]"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Save & Resend</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="group relative rounded-2xl border border-white/10 bg-[#15151b] px-4 py-3 text-[15px] leading-relaxed text-[#f0f0f5]">
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-[#777780]">
                            <button
                              type="button"
                              onClick={() => startEditing(msg)}
                              disabled={isStreaming}
                              aria-label="Edit message"
                              className="inline-flex items-center gap-1 transition-colors hover:text-[#C9C9D1] disabled:opacity-40"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-[#777780]">
                        <KuroganeEmblem size={18} glow={isCurrentlyStreaming} />
                        <span className="font-display font-semibold tracking-wider text-[#C9C9D1]">
                          KUROGANE
                        </span>
                        {msg.modelId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{getModelSpec(msg.modelId).name}</span>
                          </>
                        )}
                        {typeof msg.outputTokens === 'number' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">
                              {msg.outputTokens.toLocaleString()} tok
                              {msg.isExactTokens ? '' : ' est.'}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/[0.08] bg-[#0b0b0e]/95 px-5 py-4">
                        {msg.error ? (
                          <div className="space-y-2.5 text-sm text-[#ff7383]">
                            <p>{msg.error}</p>
                            <button
                              type="button"
                              onClick={() => onRegenerate(msg.id)}
                              disabled={isStreaming}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#A40019]/70 bg-[#A40019]/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A40019]/40"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Retry Request</span>
                            </button>
                          </div>
                        ) : msg.content ? (
                          <MarkdownRenderer content={msg.content} />
                        ) : (
                          <div className="flex items-center gap-2.5 py-1 text-sm text-[#8e8e9a]">
                            <span className="inline-block h-2 w-2 rounded-full bg-[#FF263F]" />
                            <span>Channeling arcane blade...</span>
                          </div>
                        )}

                        {isCurrentlyStreaming && msg.content && (
                          <div className="mt-2 h-0.5 w-16 bg-gradient-to-r from-[#FF263F] to-transparent" />
                        )}
                      </div>

                      {!isCurrentlyStreaming && msg.content && !msg.error && (
                        <div className="mt-2 flex items-center gap-4 px-1 text-xs text-[#777780]">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg)}
                            className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3.5 w-3.5 text-[#FF263F]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRegenerate(msg.id)}
                            disabled={isStreaming}
                            className="inline-flex items-center gap-1.5 transition-colors hover:text-white disabled:opacity-40"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={() => {
            stickToBottomRef.current = true;
            scrollToBottom(true);
          }}
          aria-label="Scroll to latest message"
          className="absolute bottom-32 right-6 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#111115] text-[#C9C9D1] shadow-lg transition-colors hover:border-[#FF263F]/60 hover:text-white"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {/* Composer */}
      <div className="border-t border-white/[0.07] bg-[#050505]/95 px-4 py-3.5 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div
            className={`blade-border-glow flex flex-col rounded-xl bg-[#111115] p-2.5 transition-all duration-300 ${
              isStreaming
                ? 'border-[#FF263F]/65 shadow-[0_0_24px_-6px_rgba(255,38,63,0.55)]'
                : 'border-[#C9C9D1]/15 shadow-[0_0_16px_-8px_rgba(201,201,209,0.2)]'
            }`}
          >
            <label htmlFor="kurogane-prompt-input" className="sr-only">
              Ask KUROGANE
            </label>
            <textarea
              id="kurogane-prompt-input"
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Speak to the Black Blade..."
              className="max-h-44 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-white placeholder-[#6f6f78] focus:outline-none"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 px-1">
              <div className="flex items-center gap-2.5 text-xs text-[#777780]">
                {/* Blade Active / Idle Status Indicator */}
                <div
                  data-testid="blade-status-indicator"
                  data-state={isStreaming ? 'thinking' : 'idle'}
                  role="status"
                  aria-live="polite"
                  aria-label={isStreaming ? 'Blade Status: Thinking' : 'Blade Status: Idle'}
                  title={
                    isStreaming
                      ? 'Black Blade Active — Channeling Response'
                      : 'Black Blade Sheathed — Idle'
                  }
                  className="inline-flex items-center gap-2 pr-1 whitespace-nowrap shrink-0"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2.5 w-2.5 rotate-45 transition-all duration-300 ${
                      isStreaming
                        ? 'animate-blade-thinking bg-[#FF263F]'
                        : 'bg-[#5c5c68] ring-1 ring-[#C9C9D1]/45 shadow-[0_0_8px_1px_rgba(201,201,209,0.28)]'
                    }`}
                  />
                  <span
                    className={`text-[11px] font-medium tracking-wider uppercase transition-colors duration-300 ${
                      isStreaming ? 'text-[#FF263F]' : 'text-[#8e8e9c]'
                    }`}
                  >
                    {isStreaming ? 'Thinking' : 'Idle'}
                  </span>
                </div>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenForge}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[#9e9ea9] transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Sliders className="h-3.5 w-3.5 text-[#FF263F]" />
                  <span>
                    {config.provider === 'custom' && config.customModelName
                      ? config.customModelName
                      : activeModel.name}
                  </span>
                </button>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {draftTokens} est. input tok
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onOpenVoice && (
                  <button
                    type="button"
                    onClick={onOpenVoice}
                    disabled={isStreaming}
                    aria-label="Open Live Voice Sanctum"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0b0b0e] px-3 py-1.5 text-xs font-medium text-[#C9C9D1] transition-colors hover:border-[#FF263F]/60 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <AudioLines className="h-3.5 w-3.5 text-[#FF263F]" />
                    <span>Live Voice</span>
                  </button>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#FF263F]/60 bg-[#A40019]/30 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#A40019]/50 whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => submitPrompt(input)}
                    disabled={!input.trim()}
                    aria-label="Send message"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#A40019] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#c2001e] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#6f6f78] whitespace-nowrap shrink-0"
                  >
                    <span>Send</span>
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
