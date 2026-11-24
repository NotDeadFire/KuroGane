export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'custom';

export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' | 'MINIMAL';

export type ResponseLengthPreset = 'concise' | 'balanced' | 'comprehensive';

export interface ModelSpec {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  maxOutputLimit: number;
  supportsTemperature: boolean;
  minTemperature: number;
  maxTemperature: number;
  supportsTopP: boolean;
  supportsThinkingLevel: boolean;
  supportedThinkingLevels?: ThinkingDepth[];
  supportsStopSequences: boolean;
  supportsStreaming: boolean;
  inputPricePer1M: number;
  outputPricePer1M: number;
  description: string;
}

export interface ForgeConfig {
  provider: ProviderId;
  modelId: string;
  temperature: number;
  maxOutputTokens: number;
  topP: number;
  streaming: boolean;
  responseLength: ResponseLengthPreset;
  systemPrompt: string;
  stopSequences: string[];
  thinkingLevel: ThinkingDepth;
  customModelName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  modelId?: string;
  provider?: ProviderId;
  inputTokens?: number;
  outputTokens?: number;
  isExactTokens?: boolean;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface UsageRecord {
  id: string;
  conversationId: string;
  conversationTitle: string;
  provider: ProviderId;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  isExact: boolean;
  timestamp: number;
}

export interface PricingOverride {
  inputPer1M: number;
  outputPer1M: number;
}

export const DEFAULT_SYSTEM_PROMPT =
  'You are KUROGANE — an awakened intelligence forged in dark steel and clarity. Your tone is calm, confident, razor-sharp, and subtly evocative of ancient craft, while always delivering rigorous, accurate, deeply practical answers. Never sacrifice technical precision or clarity for theatrics.';

export const TOKEN_PRESETS = [512, 1024, 2048, 4096, 8192] as const;

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputLimit: 65_536,
    supportsTemperature: false,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: false,
    supportsThinkingLevel: true,
    supportedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    description: 'Rapid forged intelligence with adaptive reasoning depth.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputLimit: 65_536,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: true,
    supportsThinkingLevel: true,
    supportedThinkingLevels: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    description: 'Ultra-low latency model for swift dialogue and iteration.',
  },
  {
    id: 'gemini-4-neon',
    name: 'Gemini 4 Neon',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputLimit: 65_536,
    supportsTemperature: false,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: false,
    supportsThinkingLevel: true,
    supportedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 1.25,
    outputPricePer1M: 10.0,
    description: 'High-precision blade for engineering, mathematics, and STEM.',
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputLimit: 65_536,
    supportsTemperature: false,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: false,
    supportsThinkingLevel: true,
    supportedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH'],
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 2.5,
    outputPricePer1M: 15.0,
    description: 'Deep-strata reasoning for architectural synthesis and proofs.',
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'gemini',
    contextWindow: 1_048_576,
    maxOutputLimit: 65_536,
    supportsTemperature: false,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: false,
    supportsThinkingLevel: true,
    supportedThinkingLevels: ['LOW', 'MEDIUM', 'HIGH'],
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.6,
    outputPricePer1M: 3.5,
    description: 'Balanced high-clarity synthesis and long-horizon analysis.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputLimit: 16_384,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: true,
    supportsThinkingLevel: false,
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
    description: 'OpenAI flagship omni-reasoning model (requires OpenAI key).',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputLimit: 16_384,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: true,
    supportsThinkingLevel: false,
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    description: 'Compact, high-speed OpenAI model (requires OpenAI key).',
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputLimit: 16_384,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 1,
    supportsTopP: true,
    supportsThinkingLevel: false,
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    description: 'Anthropic Sonnet 4 for nuanced writing & code (requires Anthropic key).',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputLimit: 8_192,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 1,
    supportsTopP: true,
    supportsThinkingLevel: false,
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4.0,
    description: 'Fast Anthropic model (requires Anthropic key).',
  },
  {
    id: 'custom-compatible',
    name: 'Custom OpenAI-Compatible',
    provider: 'custom',
    contextWindow: 128_000,
    maxOutputLimit: 16_384,
    supportsTemperature: true,
    minTemperature: 0,
    maxTemperature: 2,
    supportsTopP: true,
    supportsThinkingLevel: false,
    supportsStopSequences: true,
    supportsStreaming: true,
    inputPricePer1M: 0.5,
    outputPricePer1M: 1.5,
    description: 'Connect any OpenAI-compatible HTTPS endpoint.',
  },
];

export const DEFAULT_FORGE_CONFIG: ForgeConfig = {
  provider: 'gemini',
  modelId: 'gemini-4-hydrogen',
  temperature: 0.7,
  maxOutputTokens: 4096,
  topP: 0.95,
  streaming: true,
  responseLength: 'balanced',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  stopSequences: [],
  thinkingLevel: 'MEDIUM',
  customModelName: '',
};

export interface SuggestionCard {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
}

export const SUGGESTION_CARDS: SuggestionCard[] = [
  {
    id: 'explain',
    title: 'Explain something complicated',
    subtitle: 'Distill quantum entanglement or consensus algorithms into razor-sharp intuition.',
    prompt:
      'Explain how Raft distributed consensus guarantees safety during network partitions, using a crisp mental model and concrete step-by-step trace.',
  },
  {
    id: 'code',
    title: 'Write production-quality code',
    subtitle: 'Architect resilient TypeScript services, lock-free structures, or clean APIs.',
    prompt:
      'Write a production-ready TypeScript token-bucket rate limiter with sliding-window burst control, zero external dependencies, and unit test examples.',
  },
  {
    id: 'math',
    title: 'Explore mathematics',
    subtitle: 'Derive proofs, eigenvalues, and LaTeX-formatted theorems with clarity.',
    prompt:
      'Derive Euler’s identity from Taylor series expansions of $e^x$, $\\sin(x)$, and $\\cos(x)$, and explain its geometric meaning in the complex plane.',
  },
  {
    id: 'analyze',
    title: 'Analyze an idea',
    subtitle: 'Stress-test system designs, product strategy, and hidden failure modes.',
    prompt:
      'Analyze the architectural trade-offs between Server-Sent Events (SSE) and WebSockets for streaming LLM responses at high concurrency.',
  },
  {
    id: 'creative',
    title: 'Think creatively',
    subtitle: 'Forge original worldbuilding, systems lore, or sharp conceptual metaphors.',
    prompt:
      'Design the magic system rules and physical constraints for an obsidian grimoire whose power scales inversely with the caster’s certainty.',
  },
  {
    id: 'solve',
    title: 'Solve a difficult problem',
    subtitle: 'Untangle bottlenecks, race conditions, and multi-constraint puzzles.',
    prompt:
      'Walk through diagnosing a subtle memory leak in a long-lived Node.js streaming server that only manifests after 10,000 aborted client connections.',
  },
];

export function getModelSpec(modelId: string): ModelSpec {
  return MODEL_CATALOG.find((m) => m.id === modelId) ?? MODEL_CATALOG[0];
}

export function getModelsForProvider(provider: ProviderId): ModelSpec[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export interface TemperatureModeInfo {
  label: string;
  description: string;
}

export function getTemperatureMode(temperature: number): TemperatureModeInfo {
  if (temperature <= 0.3) {
    return {
      label: 'Precision mode',
      description: 'Deterministic, surgical responses ideal for code, math, and strict facts.',
    };
  }
  if (temperature <= 0.7) {
    return {
      label: 'Balanced mode',
      description: 'Measured poise combining reliability with natural fluency.',
    };
  }
  if (temperature <= 1.2) {
    return {
      label: 'Creative mode',
      description: 'Expansive ideation, richer metaphors, and exploratory reasoning.',
    };
  }
  return {
    label: 'Experimental mode',
    description: 'High entropy synthesis; unconventional leaps with lower predictability.',
  };
}

export function clampTemperatureForModel(temperature: number, model: ModelSpec): number {
  const safe = Number.isFinite(temperature) ? temperature : 0.7;
  const clamped = Math.min(model.maxTemperature, Math.max(model.minTemperature, safe));
  return Math.round(clamped * 100) / 100;
}

export function validateMaxOutputTokens(
  tokens: number,
  model: ModelSpec,
): { value: number; clamped: boolean; warning?: string } {
  const numeric = Number.isFinite(tokens) ? Math.floor(tokens) : 2048;
  const minTokens = 64;
  if (numeric < minTokens) {
    return {
      value: minTokens,
      clamped: true,
      warning: `Minimum output limit is ${minTokens} tokens.`,
    };
  }
  if (numeric > model.maxOutputLimit) {
    return {
      value: model.maxOutputLimit,
      clamped: true,
      warning: `${model.name} caps output at ${model.maxOutputLimit.toLocaleString()} tokens.`,
    };
  }
  return { value: numeric, clamped: false };
}

export interface SanitizedProviderPayload {
  provider: ProviderId;
  model: string;
  streaming: boolean;
  maxOutputTokens: number;
  systemInstruction: string;
  temperature?: number;
  topP?: number;
  thinkingLevel?: ThinkingDepth;
  stopSequences?: string[];
  omittedFields: string[];
}

export function buildSanitizedProviderPayload(
  config: ForgeConfig,
  model: ModelSpec,
): SanitizedProviderPayload {
  const omittedFields: string[] = [];
  const lengthDirective =
    config.responseLength === 'concise'
      ? '\n\nResponse length guidance: Keep answers tight, dense, and concise unless asked for depth.'
      : config.responseLength === 'comprehensive'
        ? '\n\nResponse length guidance: Provide thorough, deep, structured explanations with edge cases.'
        : '';

  const systemInstruction = (config.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() + lengthDirective;
  const validatedTokens = validateMaxOutputTokens(config.maxOutputTokens, model).value;

  const resolvedModel =
    model.provider === 'custom' && config.customModelName?.trim()
      ? config.customModelName.trim()
      : model.id;

  const payload: SanitizedProviderPayload = {
    provider: model.provider,
    model: resolvedModel,
    streaming: Boolean(config.streaming && model.supportsStreaming),
    maxOutputTokens: validatedTokens,
    systemInstruction,
    omittedFields,
  };

  if (model.supportsTemperature) {
    payload.temperature = clampTemperatureForModel(config.temperature, model);
  } else {
    omittedFields.push('temperature');
  }

  if (model.supportsTopP) {
    const safeTopP = Math.min(1, Math.max(0.05, Number.isFinite(config.topP) ? config.topP : 0.95));
    payload.topP = Math.round(safeTopP * 100) / 100;
  } else {
    omittedFields.push('topP');
  }

  if (model.supportsThinkingLevel && model.supportedThinkingLevels?.length) {
    const chosen = model.supportedThinkingLevels.includes(config.thinkingLevel)
      ? config.thinkingLevel
      : model.supportedThinkingLevels.includes('MEDIUM')
        ? 'MEDIUM'
        : model.supportedThinkingLevels[0];
    payload.thinkingLevel = chosen;
  } else {
    omittedFields.push('thinkingLevel');
  }

  if (model.supportsStopSequences && Array.isArray(config.stopSequences) && config.stopSequences.length > 0) {
    const cleaned = config.stopSequences
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 4);
    if (cleaned.length > 0) {
      payload.stopSequences = cleaned;
    }
  }

  return payload;
}

export function estimateTokenCount(text: string, provider: ProviderId = 'gemini'): number {
  if (!text) return 0;
  const trimmed = text;
  // Heuristic calibrated by provider tokenization density:
  // code punctuation and non-ASCII characters consume slightly more tokens.
  const nonAscii = (trimmed.match(/[^\x00-\x7F]/g) ?? []).length;
  const codeSymbols = (trimmed.match(/[{}()[\];=<>+\-*/\\|`~]/g) ?? []).length;
  const asciiChars = trimmed.length - nonAscii;
  const charsPerToken = provider === 'anthropic' ? 3.7 : provider === 'openai' ? 3.9 : 4.0;
  const rawEstimate = asciiChars / charsPerToken + nonAscii * 0.85 + codeSymbols * 0.15;
  return Math.max(1, Math.ceil(rawEstimate));
}

export function calculateEstimatedCost(
  inputTokens: number,
  outputTokens: number,
  model: ModelSpec,
  override?: PricingOverride,
): number {
  const inPrice = override?.inputPer1M ?? model.inputPricePer1M;
  const outPrice = override?.outputPer1M ?? model.outputPricePer1M;
  const cost = (Math.max(0, inputTokens) / 1_000_000) * inPrice +
    (Math.max(0, outputTokens) / 1_000_000) * outPrice;
  return Number(cost.toFixed(6));
}

export interface AggregatedAnalytics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCost: number;
  requestCount: number;
  averageTokensPerRequest: number;
  hasEstimatedRecords: boolean;
  timeSeries: Array<{
    label: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }>;
  byModel: Array<{
    modelId: string;
    modelName: string;
    provider: ProviderId;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requests: number;
    estimatedCost: number;
  }>;
  byConversation: Array<{
    conversationId: string;
    title: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requests: number;
    estimatedCost: number;
  }>;
}

export function aggregateUsageAnalytics(
  records: UsageRecord[],
  pricingOverrides: Record<string, PricingOverride> = {},
): AggregatedAnalytics {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCost = 0;
  let hasEstimatedRecords = false;

  const modelMap = new Map<
    string,
    {
      modelId: string;
      modelName: string;
      provider: ProviderId;
      inputTokens: number;
      outputTokens: number;
      requests: number;
      estimatedCost: number;
    }
  >();

  const convMap = new Map<
    string,
    {
      conversationId: string;
      title: string;
      inputTokens: number;
      outputTokens: number;
      requests: number;
      estimatedCost: number;
    }
  >();

  const bucketMap = new Map<
    string,
    { label: string; sortKey: number; inputTokens: number; outputTokens: number; estimatedCost: number }
  >();

  for (const rec of records) {
    const spec = getModelSpec(rec.modelId);
    const cost = calculateEstimatedCost(
      rec.inputTokens,
      rec.outputTokens,
      spec,
      pricingOverrides[rec.modelId],
    );

    totalInputTokens += rec.inputTokens;
    totalOutputTokens += rec.outputTokens;
    totalEstimatedCost += cost;
    if (!rec.isExact) hasEstimatedRecords = true;

    const existingModel = modelMap.get(rec.modelId) ?? {
      modelId: rec.modelId,
      modelName: spec.id === rec.modelId ? spec.name : rec.modelId,
      provider: rec.provider,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      estimatedCost: 0,
    };
    existingModel.inputTokens += rec.inputTokens;
    existingModel.outputTokens += rec.outputTokens;
    existingModel.requests += 1;
    existingModel.estimatedCost = Number((existingModel.estimatedCost + cost).toFixed(6));
    modelMap.set(rec.modelId, existingModel);

    const existingConv = convMap.get(rec.conversationId) ?? {
      conversationId: rec.conversationId,
      title: rec.conversationTitle || 'Untitled Chronicle',
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
      estimatedCost: 0,
    };
    existingConv.inputTokens += rec.inputTokens;
    existingConv.outputTokens += rec.outputTokens;
    existingConv.requests += 1;
    existingConv.estimatedCost = Number((existingConv.estimatedCost + cost).toFixed(6));
    convMap.set(rec.conversationId, existingConv);

    const d = new Date(rec.timestamp);
    const hourKey = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`;
    const bucketSort = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    const bucket = bucketMap.get(hourKey) ?? {
      label: hourKey,
      sortKey: bucketSort,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    };
    bucket.inputTokens += rec.inputTokens;
    bucket.outputTokens += rec.outputTokens;
    bucket.estimatedCost = Number((bucket.estimatedCost + cost).toFixed(6));
    bucketMap.set(hourKey, bucket);
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  const requestCount = records.length;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalEstimatedCost: Number(totalEstimatedCost.toFixed(6)),
    requestCount,
    averageTokensPerRequest: requestCount > 0 ? Math.round(totalTokens / requestCount) : 0,
    hasEstimatedRecords,
    timeSeries: Array.from(bucketMap.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ label, inputTokens, outputTokens, estimatedCost }) => ({
        label,
        inputTokens,
        outputTokens,
        estimatedCost,
      })),
    byModel: Array.from(modelMap.values())
      .map((m) => ({
        ...m,
        totalTokens: m.inputTokens + m.outputTokens,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    byConversation: Array.from(convMap.values())
      .map((c) => ({
        ...c,
        totalTokens: c.inputTokens + c.outputTokens,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens),
  };
}

export function filterAndSortConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q)),
      )
    : conversations;

  return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function maskCredential(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export function deriveConversationTitle(firstPrompt: string): string {
  const cleaned = firstPrompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New Chronicle';
  return cleaned.length > 44 ? `${cleaned.slice(0, 41)}...` : cleaned;
}

export type AwakeningPhase =
  | 'silence'
  | 'grimoire_manifest'
  | 'sword_emerge'
  | 'angle_grimoire'
  | 'reveal'
  | 'ready'
  | 'slashing';

export const AWAKENING_TIMINGS_MS = {
  GRIMOIRE_MANIFEST: 1500,
  SWORD_EMERGE: 5200,
  ANGLE_GRIMOIRE: 9600,
  REVEAL: 14400,
  READY: 17500,
} as const;

export function getAwakeningPhaseAt(elapsedMs: number): AwakeningPhase {
  if (elapsedMs < AWAKENING_TIMINGS_MS.GRIMOIRE_MANIFEST) return 'silence';
  if (elapsedMs < AWAKENING_TIMINGS_MS.SWORD_EMERGE) return 'grimoire_manifest';
  if (elapsedMs < AWAKENING_TIMINGS_MS.ANGLE_GRIMOIRE) return 'sword_emerge';
  if (elapsedMs < AWAKENING_TIMINGS_MS.REVEAL) return 'angle_grimoire';
  if (elapsedMs < AWAKENING_TIMINGS_MS.READY) return 'reveal';
  return 'ready';
}

