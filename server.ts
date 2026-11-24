import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, Modality, ThinkingLevel, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import {
  buildSanitizedProviderPayload,
  DEFAULT_SYSTEM_PROMPT,
  estimateTokenCount,
  getModelSpec,
  maskCredential,
  type ForgeConfig,
  type ProviderId,
} from './src/lib/kuroganeLogic.ts';
import { isAllowedLiveVoice, LIVE_MODEL_ID } from './src/lib/liveAudio.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface StoredCredential {
  provider: ProviderId;
  apiKey: string;
  maskedKey: string;
  endpoint?: string;
  customModel?: string;
  connectedAt: number;
  expiresAt: number;
}

interface SessionVault {
  token: string;
  createdAt: number;
  credentials: Partial<Record<ProviderId, StoredCredential>>;
}

const sessions = new Map<string, SessionVault>();

// Prune expired credentials periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, vault] of sessions.entries()) {
    for (const key of Object.keys(vault.credentials) as ProviderId[]) {
      const cred = vault.credentials[key];
      if (cred && cred.expiresAt <= now) {
        delete vault.credentials[key];
      }
    }
    if (Object.keys(vault.credentials).length === 0 && now - vault.createdAt > 12 * 60 * 60 * 1000) {
      sessions.delete(token);
    }
  }
}, 60_000).unref();

function getOrCreateSession(req: Request): SessionVault {
  const headerToken = req.header('X-Kurogane-Session')?.trim();
  if (headerToken && /^[a-f0-9]{48,64}$/i.test(headerToken)) {
    const existing = sessions.get(headerToken);
    if (existing) {
      pruneExpiredVault(existing);
      return existing;
    }
  }
  const token = crypto.randomBytes(24).toString('hex');
  const vault: SessionVault = {
    token,
    createdAt: Date.now(),
    credentials: {},
  };
  sessions.set(token, vault);
  return vault;
}

function pruneExpiredVault(vault: SessionVault): void {
  const now = Date.now();
  for (const key of Object.keys(vault.credentials) as ProviderId[]) {
    const cred = vault.credentials[key];
    if (cred && cred.expiresAt <= now) {
      delete vault.credentials[key];
    }
  }
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === '169.254.169.254'
  ) {
    return true;
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true;
  }
  const match172 = h.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^fe80:/i.test(h) || /^fc00:/i.test(h) || /^fd/i.test(h)) {
    return true;
  }
  return false;
}

function validateExternalEndpoint(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return { ok: false, error: 'Custom endpoints must use HTTPS.' };
    }
    if (!parsed.hostname || isPrivateOrLoopbackHost(parsed.hostname)) {
      return { ok: false, error: 'Endpoint host is not permitted.' };
    }
    const clean = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    return { ok: true, url: clean };
  } catch {
    return { ok: false, error: 'Invalid endpoint URL format.' };
  }
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveProviderKey(
  provider: ProviderId,
  vault: SessionVault,
): { apiKey?: string; source: 'session' | 'environment' | 'none'; endpoint?: string; customModel?: string } {
  pruneExpiredVault(vault);
  const sessionCred = vault.credentials[provider];
  if (sessionCred && sessionCred.apiKey) {
    return {
      apiKey: sessionCred.apiKey,
      source: 'session',
      endpoint: sessionCred.endpoint,
      customModel: sessionCred.customModel,
    };
  }
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    return {
      apiKey: process.env.GEMINI_API_KEY,
      source: 'environment',
    };
  }
  return { source: 'none' };
}

function toThinkingLevelEnum(level?: string): ThinkingLevel {
  switch (level) {
    case 'MINIMAL':
      return ThinkingLevel.MINIMAL;
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'MEDIUM':
    default:
      return ThinkingLevel.MEDIUM;
  }
}

function unwrapUpstreamError(err: unknown): string {
  const errObj =
    err && typeof err === 'object'
      ? (err as { message?: unknown; reason?: unknown; error?: { message?: unknown } })
      : null;
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof errObj?.message === 'string' && errObj.message
        ? errObj.message
        : typeof errObj?.error?.message === 'string' && errObj.error.message
          ? errObj.error.message
          : typeof errObj?.reason === 'string' && errObj.reason
            ? errObj.reason
            : 'Upstream provider request failed.';
  let message = rawMessage;
  try {
    const outer = JSON.parse(rawMessage) as {
      error?: { message?: string; code?: number; status?: string };
    };
    if (outer?.error?.message) {
      try {
        const inner = JSON.parse(outer.error.message) as {
          error?: { message?: string; code?: number; status?: string };
        };
        if (inner?.error?.message) {
          message = `${inner.error.status || 'Provider Error'} (${inner.error.code || ''}): ${inner.error.message}`;
        } else {
          message = outer.error.message;
        }
      } catch {
        message = outer.error.message;
      }
    }
  } catch {
    // rawMessage is already plain text
  }
  return message;
}

function buildPublicVaultStatus(vault: SessionVault) {
  pruneExpiredVault(vault);
  const envGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const providers: Record<
    ProviderId,
    {
      connected: boolean;
      source: 'session' | 'environment' | 'none';
      maskedKey?: string;
      endpoint?: string;
      customModel?: string;
      expiresAt?: number;
    }
  > = {
    gemini: vault.credentials.gemini
      ? {
          connected: true,
          source: 'session',
          maskedKey: vault.credentials.gemini.maskedKey,
          expiresAt: vault.credentials.gemini.expiresAt,
        }
      : {
          connected: envGeminiConfigured,
          source: envGeminiConfigured ? 'environment' : 'none',
        },
    openai: vault.credentials.openai
      ? {
          connected: true,
          source: 'session',
          maskedKey: vault.credentials.openai.maskedKey,
          expiresAt: vault.credentials.openai.expiresAt,
        }
      : { connected: false, source: 'none' },
    anthropic: vault.credentials.anthropic
      ? {
          connected: true,
          source: 'session',
          maskedKey: vault.credentials.anthropic.maskedKey,
          expiresAt: vault.credentials.anthropic.expiresAt,
        }
      : { connected: false, source: 'none' },
    custom: vault.credentials.custom
      ? {
          connected: true,
          source: 'session',
          maskedKey: vault.credentials.custom.maskedKey,
          endpoint: vault.credentials.custom.endpoint,
          customModel: vault.credentials.custom.customModel,
          expiresAt: vault.credentials.custom.expiresAt,
        }
      : { connected: false, source: 'none' },
  };
  return {
    sessionToken: vault.token,
    providers,
  };
}

async function testProviderCredential(
  provider: ProviderId,
  apiKey: string,
  endpoint?: string,
  customModel?: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    if (provider === 'gemini') {
      const ai = createGeminiClient(apiKey);
      const res = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: 'Reply with a single word: Ready.',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      if (res.text !== undefined) {
        return { ok: true, message: 'Gemini connection verified.' };
      }
      return { ok: true, message: 'Gemini endpoint reachable.' };
    }

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          error: `OpenAI rejected credentials (${response.status}): ${body.slice(0, 140)}`,
        };
      }
      return { ok: true, message: 'OpenAI connection verified.' };
    }

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say Ready.' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          error: `Anthropic rejected request (${response.status}): ${body.slice(0, 140)}`,
        };
      }
      return { ok: true, message: 'Anthropic connection verified.' };
    }

    if (provider === 'custom') {
      if (!endpoint) {
        return { ok: false, error: 'Custom endpoint URL is required.' };
      }
      const checked = validateExternalEndpoint(endpoint);
      if (!checked.ok) return checked;
      const chatUrl = checked.url.endsWith('/chat/completions')
        ? checked.url
        : `${checked.url}/chat/completions`;
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: customModel?.trim() || 'gpt-4o-mini',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say Ready.' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          error: `Custom endpoint error (${response.status}): ${body.slice(0, 140)}`,
        };
      }
      return { ok: true, message: 'Custom compatible endpoint verified.' };
    }

    return { ok: false, error: 'Unsupported provider.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection test failed.';
    return { ok: false, error: msg };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Initialize or inspect server-side session
  app.get('/api/vault/status', (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    res.json(buildPublicVaultStatus(vault));
  });

  // Save a temporary provider credential in server-side session memory
  app.post('/api/vault/connect', async (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    const { provider, apiKey, endpoint, customModel, ttlMinutes, verify } = req.body as {
      provider?: ProviderId;
      apiKey?: string;
      endpoint?: string;
      customModel?: string;
      ttlMinutes?: number;
      verify?: boolean;
    };

    if (!provider || !['gemini', 'openai', 'anthropic', 'custom'].includes(provider)) {
      res.status(400).json({ error: 'Invalid AI provider selected.' });
      return;
    }

    const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!trimmedKey || trimmedKey.length < 8) {
      res.status(400).json({ error: 'Please provide a valid API key.' });
      return;
    }

    let cleanEndpoint: string | undefined;
    if (provider === 'custom') {
      if (!endpoint || typeof endpoint !== 'string') {
        res.status(400).json({ error: 'A custom HTTPS endpoint URL is required.' });
        return;
      }
      const checked = validateExternalEndpoint(endpoint);
      if (!checked.ok) {
        res.status(400).json({ error: checked.error });
        return;
      }
      cleanEndpoint = checked.url;
    }

    if (verify) {
      const testResult = await testProviderCredential(provider, trimmedKey, cleanEndpoint, customModel);
      if (!testResult.ok) {
        res.status(400).json({ error: testResult.error, status: buildPublicVaultStatus(vault) });
        return;
      }
    }

    const ttlMs = Math.min(24 * 60, Math.max(5, Number(ttlMinutes) || 60)) * 60_000;
    const now = Date.now();
    vault.credentials[provider] = {
      provider,
      apiKey: trimmedKey,
      maskedKey: maskCredential(trimmedKey),
      endpoint: cleanEndpoint,
      customModel: customModel?.trim() || undefined,
      connectedAt: now,
      expiresAt: now + ttlMs,
    };

    res.json({
      ok: true,
      message: `${provider.toUpperCase()} credentials stored for this session.`,
      ...buildPublicVaultStatus(vault),
    });
  });

  // Test currently active or provided credentials without exposing them
  app.post('/api/vault/test', async (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    const { provider, apiKey, endpoint, customModel } = req.body as {
      provider?: ProviderId;
      apiKey?: string;
      endpoint?: string;
      customModel?: string;
    };

    if (!provider || !['gemini', 'openai', 'anthropic', 'custom'].includes(provider)) {
      res.status(400).json({ error: 'Invalid provider.' });
      return;
    }

    const resolved = resolveProviderKey(provider, vault);
    const keyToUse = typeof apiKey === 'string' && apiKey.trim().length >= 8 ? apiKey.trim() : resolved.apiKey;
    const endpointToUse = endpoint?.trim() || resolved.endpoint;
    const modelToUse = customModel?.trim() || resolved.customModel;

    if (!keyToUse) {
      res.status(400).json({ error: `No API key configured for ${provider}.` });
      return;
    }

    const result = await testProviderCredential(provider, keyToUse, endpointToUse, modelToUse);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, message: result.message });
  });

  app.post('/api/vault/disconnect', (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    const { provider } = req.body as { provider?: ProviderId };
    if (provider && vault.credentials[provider]) {
      delete vault.credentials[provider];
    }
    res.json({ ok: true, ...buildPublicVaultStatus(vault) });
  });

  app.post('/api/vault/clear', (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    vault.credentials = {};
    res.json({ ok: true, ...buildPublicVaultStatus(vault) });
  });

  // Exact tokenizer endpoint (uses Gemini countTokens when available, heuristic otherwise)
  app.post('/api/tokens/count', async (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    const { text, provider, modelId } = req.body as {
      text?: string;
      provider?: ProviderId;
      modelId?: string;
    };
    const content = typeof text === 'string' ? text : '';
    const targetProvider: ProviderId = provider || 'gemini';
    const targetModel = modelId || 'gemini-4-hydrogen';

    if (!content) {
      res.json({ tokens: 0, exact: true });
      return;
    }

    if (targetProvider === 'gemini') {
      const resolved = resolveProviderKey('gemini', vault);
      if (resolved.apiKey) {
        try {
          const ai = createGeminiClient(resolved.apiKey);
          const counted = await ai.models.countTokens({
            model: targetModel,
            contents: content,
          });
          if (typeof counted.totalTokens === 'number') {
            res.json({ tokens: counted.totalTokens, exact: true });
            return;
          }
        } catch {
          // Fallback cleanly to estimator below
        }
      }
    }

    res.json({
      tokens: estimateTokenCount(content, targetProvider),
      exact: false,
    });
  });

  // Primary AI Chat endpoint (supports SSE streaming & non-streaming)
  app.post('/api/chat', async (req: Request, res: Response) => {
    const vault = getOrCreateSession(req);
    const { messages, config } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      config?: ForgeConfig;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'At least one message is required.' });
      return;
    }

    const sanitizedMessages = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    if (sanitizedMessages.length === 0) {
      res.status(400).json({ error: 'Message content cannot be empty.' });
      return;
    }

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    });

    const sendSseHeaders = () => {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    };

    const writeSse = (obj: unknown) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      }
    };

    try {
      const safeConfig = config ?? ({} as ForgeConfig);
      const modelSpec = getModelSpec(safeConfig.modelId || 'gemini-4-hydrogen');
      const payload = buildSanitizedProviderPayload(safeConfig, modelSpec);
      const resolved = resolveProviderKey(payload.provider, vault);

      if (!resolved.apiKey) {
        res.status(401).json({
          error: `No active API credentials found for ${payload.provider.toUpperCase()}. Configure your key in API Vault or select Gemini.`,
        });
        return;
      }

      const inputTextJoined =
        payload.systemInstruction + '\n' + sanitizedMessages.map((m) => m.content).join('\n');

      if (payload.provider === 'gemini') {
        const ai = createGeminiClient(resolved.apiKey);
        const contents = sanitizedMessages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const geminiConfig: Record<string, unknown> = {
          systemInstruction: payload.systemInstruction,
          maxOutputTokens: payload.maxOutputTokens,
        };
        if (payload.stopSequences?.length) {
          geminiConfig.stopSequences = payload.stopSequences;
        }
        if (payload.temperature !== undefined) {
          geminiConfig.temperature = payload.temperature;
        }
        if (payload.topP !== undefined) {
          geminiConfig.topP = payload.topP;
        }
        if (payload.thinkingLevel) {
          geminiConfig.thinkingConfig = {
            thinkingLevel: toThinkingLevelEnum(payload.thinkingLevel),
          };
        }

        if (payload.streaming) {
          sendSseHeaders();
          const stream = await ai.models.generateContentStream({
            model: payload.model,
            contents,
            config: geminiConfig,
          });

          let fullText = '';
          let exactInputTokens: number | undefined;
          let exactOutputTokens: number | undefined;

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;
            const delta = chunk.text ?? '';
            if (delta) {
              fullText += delta;
              writeSse({ type: 'delta', text: delta });
            }
            if (chunk.usageMetadata) {
              if (typeof chunk.usageMetadata.promptTokenCount === 'number') {
                exactInputTokens = chunk.usageMetadata.promptTokenCount;
              }
              if (typeof chunk.usageMetadata.candidatesTokenCount === 'number') {
                exactOutputTokens = chunk.usageMetadata.candidatesTokenCount;
              }
            }
          }

          const isExact = exactInputTokens !== undefined && exactOutputTokens !== undefined;
          writeSse({
            type: 'done',
            usage: {
              inputTokens: exactInputTokens ?? estimateTokenCount(inputTextJoined, 'gemini'),
              outputTokens: exactOutputTokens ?? estimateTokenCount(fullText, 'gemini'),
              isExact,
            },
          });
          res.end();
          return;
        }

        const response = await ai.models.generateContent({
          model: payload.model,
          contents,
          config: geminiConfig,
        });
        const text = response.text ?? '';
        const meta = response.usageMetadata;
        const isExact =
          typeof meta?.promptTokenCount === 'number' && typeof meta?.candidatesTokenCount === 'number';
        res.json({
          text,
          usage: {
            inputTokens: meta?.promptTokenCount ?? estimateTokenCount(inputTextJoined, 'gemini'),
            outputTokens: meta?.candidatesTokenCount ?? estimateTokenCount(text, 'gemini'),
            isExact,
          },
        });
        return;
      }

      if (payload.provider === 'openai' || payload.provider === 'custom') {
        const baseEndpoint =
          payload.provider === 'custom'
            ? resolved.endpoint || ''
            : 'https://api.openai.com/v1';

        if (!baseEndpoint) {
          res.status(400).json({ error: 'Custom endpoint URL is missing.' });
          return;
        }

        const chatUrl = baseEndpoint.endsWith('/chat/completions')
          ? baseEndpoint
          : `${baseEndpoint}/chat/completions`;

        const targetModel =
          payload.provider === 'custom'
            ? safeConfig.customModelName?.trim() || resolved.customModel || 'gpt-4o-mini'
            : payload.model;

        const openAiBody: Record<string, unknown> = {
          model: targetModel,
          messages: [
            { role: 'system', content: payload.systemInstruction },
            ...sanitizedMessages,
          ],
          max_tokens: payload.maxOutputTokens,
          stream: payload.streaming,
        };
        if (payload.temperature !== undefined) openAiBody.temperature = payload.temperature;
        if (payload.topP !== undefined) openAiBody.top_p = payload.topP;
        if (payload.stopSequences?.length) openAiBody.stop = payload.stopSequences;
        if (payload.streaming) openAiBody.stream_options = { include_usage: true };

        const upstream = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resolved.apiKey}`,
          },
          body: JSON.stringify(openAiBody),
          signal: abortController.signal,
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          res.status(upstream.status).json({
            error: `Provider error (${upstream.status}): ${errText.slice(0, 220)}`,
          });
          return;
        }

        if (!payload.streaming) {
          const data = (await upstream.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const text = data.choices?.[0]?.message?.content ?? '';
          const isExact =
            typeof data.usage?.prompt_tokens === 'number' &&
            typeof data.usage?.completion_tokens === 'number';
          res.json({
            text,
            usage: {
              inputTokens:
                data.usage?.prompt_tokens ?? estimateTokenCount(inputTextJoined, payload.provider),
              outputTokens:
                data.usage?.completion_tokens ?? estimateTokenCount(text, payload.provider),
              isExact,
            },
          });
          return;
        }

        sendSseHeaders();
        const reader = upstream.body?.getReader();
        if (!reader) {
          writeSse({ type: 'error', error: 'Upstream stream unavailable.' });
          res.end();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let exactIn: number | undefined;
        let exactOut: number | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonPart = trimmed.slice(5).trim();
            if (jsonPart === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonPart) as {
                choices?: Array<{ delta?: { content?: string } }>;
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                fullText += delta;
                writeSse({ type: 'delta', text: delta });
              }
              if (parsed.usage) {
                if (typeof parsed.usage.prompt_tokens === 'number') exactIn = parsed.usage.prompt_tokens;
                if (typeof parsed.usage.completion_tokens === 'number') {
                  exactOut = parsed.usage.completion_tokens;
                }
              }
            } catch {
              // ignore malformed partial frames
            }
          }
        }

        writeSse({
          type: 'done',
          usage: {
            inputTokens: exactIn ?? estimateTokenCount(inputTextJoined, payload.provider),
            outputTokens: exactOut ?? estimateTokenCount(fullText, payload.provider),
            isExact: exactIn !== undefined && exactOut !== undefined,
          },
        });
        res.end();
        return;
      }

      if (payload.provider === 'anthropic') {
        const anthBody: Record<string, unknown> = {
          model: payload.model,
          system: payload.systemInstruction,
          messages: sanitizedMessages,
          max_tokens: payload.maxOutputTokens,
          stream: payload.streaming,
        };
        if (payload.temperature !== undefined) anthBody.temperature = payload.temperature;
        if (payload.topP !== undefined) anthBody.top_p = payload.topP;
        if (payload.stopSequences?.length) anthBody.stop_sequences = payload.stopSequences;

        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': resolved.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(anthBody),
          signal: abortController.signal,
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          res.status(upstream.status).json({
            error: `Anthropic error (${upstream.status}): ${errText.slice(0, 220)}`,
          });
          return;
        }

        if (!payload.streaming) {
          const data = (await upstream.json()) as {
            content?: Array<{ text?: string }>;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          const text = data.content?.map((c) => c.text ?? '').join('') ?? '';
          const isExact =
            typeof data.usage?.input_tokens === 'number' &&
            typeof data.usage?.output_tokens === 'number';
          res.json({
            text,
            usage: {
              inputTokens: data.usage?.input_tokens ?? estimateTokenCount(inputTextJoined, 'anthropic'),
              outputTokens: data.usage?.output_tokens ?? estimateTokenCount(text, 'anthropic'),
              isExact,
            },
          });
          return;
        }

        sendSseHeaders();
        const reader = upstream.body?.getReader();
        if (!reader) {
          writeSse({ type: 'error', error: 'Anthropic stream unavailable.' });
          res.end();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let exactIn: number | undefined;
        let exactOut: number | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonPart = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(jsonPart) as {
                type?: string;
                delta?: { text?: string };
                message?: { usage?: { input_tokens?: number } };
                usage?: { output_tokens?: number };
              };
              if (parsed.type === 'message_start' && typeof parsed.message?.usage?.input_tokens === 'number') {
                exactIn = parsed.message.usage.input_tokens;
              }
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text;
                writeSse({ type: 'delta', text: parsed.delta.text });
              }
              if (parsed.type === 'message_delta' && typeof parsed.usage?.output_tokens === 'number') {
                exactOut = parsed.usage.output_tokens;
              }
            } catch {
              // ignore malformed partial frames
            }
          }
        }

        writeSse({
          type: 'done',
          usage: {
            inputTokens: exactIn ?? estimateTokenCount(inputTextJoined, 'anthropic'),
            outputTokens: exactOut ?? estimateTokenCount(fullText, 'anthropic'),
            isExact: exactIn !== undefined && exactOut !== undefined,
          },
        });
        res.end();
        return;
      }

      res.status(400).json({ error: 'Unsupported provider.' });
    } catch (err) {
      if (abortController.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      const message = unwrapUpstreamError(err);
      const status =
        /429|RESOURCE_EXHAUSTED/i.test(message)
          ? 429
          : /401|403|PERMISSION_DENIED|API_KEY_INVALID/i.test(message)
            ? 401
            : /404|NOT_FOUND/i.test(message)
              ? 404
              : 500;

      if (res.headersSent) {
        writeSse({ type: 'error', error: message });
        res.end();
      } else {
        res.status(status).json({ error: message });
      }
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname !== '/api/live') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs, req) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost');
    const sessionToken = reqUrl.searchParams.get('session')?.trim() || '';
    const vault =
      sessionToken && /^[a-f0-9]{48,64}$/i.test(sessionToken) ? sessions.get(sessionToken) : undefined;

    const resolvedKey = vault
      ? resolveProviderKey('gemini', vault).apiKey
      : process.env.GEMINI_API_KEY;

    let closed = false;
    let liveSessionPromise: Promise<Awaited<ReturnType<GoogleGenAI['live']['connect']>>> | null =
      null;

    const safeSend = (payload: unknown) => {
      if (!closed && clientWs.readyState === WsSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeLiveSession = async () => {
      if (!liveSessionPromise) return;
      try {
        const s = await liveSessionPromise;
        s.close();
      } catch {
        // ignore cleanup errors
      }
      liveSessionPromise = null;
    };

    clientWs.on('message', async (rawData) => {
      if (closed) return;
      let msg: { type?: string; voiceName?: string; systemInstruction?: string; data?: string; text?: string };
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        safeSend({ type: 'error', error: 'Malformed Live API message payload.' });
        return;
      }

      if (msg.type === 'start') {
        if (liveSessionPromise) return;
        if (!resolvedKey) {
          safeSend({
            type: 'error',
            error: 'No active Gemini API key found on the server. Configure GEMINI_API_KEY or connect one in API Vault.',
          });
          return;
        }

        const validVoice = isAllowedLiveVoice(msg.voiceName) ? msg.voiceName : 'Charon';
        const customPrompt =
          typeof msg.systemInstruction === 'string' && msg.systemInstruction.trim()
            ? msg.systemInstruction.trim().slice(0, 4000)
            : DEFAULT_SYSTEM_PROMPT;

        const ai = createGeminiClient(resolvedKey);
        try {
          liveSessionPromise = ai.live.connect({
            model: LIVE_MODEL_ID,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: validVoice } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: `${customPrompt}\nRespond naturally in spoken conversation—concise, calm, and clear.`,
            },
            callbacks: {
              onopen: () => {
                safeSend({ type: 'ready', model: LIVE_MODEL_ID, voice: validVoice });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  safeSend({ type: 'inputTranscript', text: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  safeSend({ type: 'outputTranscript', text: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend({ type: 'audio', data: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  safeSend({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  safeSend({ type: 'turnComplete' });
                }
              },
              onerror: (err: unknown) => {
                safeSend({ type: 'error', error: unwrapUpstreamError(err) });
              },
              onclose: (ev: { reason?: string }) => {
                safeSend({ type: 'closed', reason: ev?.reason || 'Live voice session closed.' });
              },
            },
          });

          await liveSessionPromise;
        } catch (err) {
          liveSessionPromise = null;
          safeSend({ type: 'error', error: unwrapUpstreamError(err) });
        }
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0 && msg.data.length <= 512_000) {
        if (!liveSessionPromise) return;
        try {
          const session = await liveSessionPromise;
          session.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch (err) {
          safeSend({ type: 'error', error: unwrapUpstreamError(err) });
        }
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string') {
        const trimmed = msg.text.trim();
        if (!trimmed || trimmed.length > 8000 || !liveSessionPromise) return;
        try {
          const session = await liveSessionPromise;
          session.sendRealtimeInput({ text: trimmed });
        } catch (err) {
          safeSend({ type: 'error', error: unwrapUpstreamError(err) });
        }
        return;
      }

      if (msg.type === 'stop') {
        await closeLiveSession();
        safeSend({ type: 'closed', reason: 'Session ended by user.' });
      }
    });

    clientWs.on('close', () => {
      closed = true;
      void closeLiveSession();
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KUROGANE server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KUROGANE server:', err);
  process.exit(1);
});
