import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  PlugZap,
  ShieldCheck,
  Trash2,
  Unplug,
  AlertCircle,
} from 'lucide-react';
import {
  getModelsForProvider,
  type ForgeConfig,
  type ProviderId,
} from '../lib/kuroganeLogic';

export interface ProviderVaultStatus {
  connected: boolean;
  source: 'session' | 'environment' | 'none';
  maskedKey?: string;
  endpoint?: string;
  customModel?: string;
  expiresAt?: number;
}

export interface VaultStatusResponse {
  sessionToken: string;
  providers: Record<ProviderId, ProviderVaultStatus>;
}

interface ApiVaultProps {
  vaultStatus: VaultStatusResponse | null;
  config: ForgeConfig;
  onConfigChange: (next: ForgeConfig) => void;
  onRefreshVault: () => Promise<void>;
  sessionToken: string;
}

const PROVIDERS: Array<{ id: ProviderId; name: string; subtitle: string }> = [
  { id: 'gemini', name: 'Google Gemini', subtitle: 'Server SDK · Gemini 4 & 3.1' },
  { id: 'openai', name: 'OpenAI', subtitle: 'GPT-4o & GPT-4o Mini' },
  { id: 'anthropic', name: 'Anthropic', subtitle: 'Claude Sonnet 4 & Haiku' },
  { id: 'custom', name: 'Custom Endpoint', subtitle: 'OpenAI-Compatible HTTPS' },
];

export const ApiVault: React.FC<ApiVaultProps> = ({
  vaultStatus,
  config,
  onConfigChange,
  onRefreshVault,
  sessionToken,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(config.provider);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [endpointInput, setEndpointInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState(config.customModelName ?? '');
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const currentStatus = vaultStatus?.providers[selectedProvider] ?? {
    connected: false,
    source: 'none',
  };
  const providerModels = getModelsForProvider(selectedProvider);

  const headersWithSession = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) h['X-Kurogane-Session'] = sessionToken;
    return h;
  };

  const handleSelectProvider = (provider: ProviderId) => {
    setSelectedProvider(provider);
    setFeedback(null);
    setApiKeyInput('');
    const models = getModelsForProvider(provider);
    if (models.length > 0 && config.provider !== provider) {
      onConfigChange({
        ...config,
        provider,
        modelId: models[0].id,
      });
    }
  };

  const handleSave = async (verifyFirst: boolean) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/vault/connect', {
        method: 'POST',
        headers: headersWithSession(),
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyInput,
          endpoint: selectedProvider === 'custom' ? endpointInput : undefined,
          customModel: selectedProvider === 'custom' ? customModelInput : undefined,
          ttlMinutes,
          verify: verifyFirst,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Failed to store credentials.' });
      } else {
        setApiKeyInput('');
        if (selectedProvider === 'custom' && customModelInput.trim()) {
          onConfigChange({ ...config, customModelName: customModelInput.trim() });
        }
        await onRefreshVault();
        setFeedback({
          type: 'success',
          text: data.message || 'Credentials saved to server session.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error while connecting to vault.' });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/vault/test', {
        method: 'POST',
        headers: headersWithSession(),
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyInput.trim() || undefined,
          endpoint: selectedProvider === 'custom' ? endpointInput.trim() || undefined : undefined,
          customModel:
            selectedProvider === 'custom' ? customModelInput.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Connection test failed.' });
      } else {
        setFeedback({ type: 'success', text: data.message || 'Connection verified.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Unable to reach test endpoint.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await fetch('/api/vault/disconnect', {
        method: 'POST',
        headers: headersWithSession(),
        body: JSON.stringify({ provider: selectedProvider }),
      });
      await onRefreshVault();
      setFeedback({
        type: 'success',
        text: `Disconnected temporary session key for ${selectedProvider.toUpperCase()}.`,
      });
    } catch {
      setFeedback({ type: 'error', text: 'Failed to disconnect provider.' });
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await fetch('/api/vault/clear', {
        method: 'POST',
        headers: headersWithSession(),
      });
      setApiKeyInput('');
      await onRefreshVault();
      setFeedback({
        type: 'success',
        text: 'All temporary session credentials have been cleared from server memory.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Failed to clear temporary credentials.' });
    } finally {
      setBusy(false);
    }
  };

  const expiresInMin = currentStatus.expiresAt
    ? Math.max(1, Math.round((currentStatus.expiresAt - Date.now()) / 60_000))
    : null;

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-[#FF263F] uppercase">
              <KeyRound className="h-3.5 w-3.5" />
              <span>API Configuration</span>
            </div>
            <h1 className="font-display mt-1 text-2xl sm:text-3xl font-semibold tracking-wider text-white">
              API VAULT
            </h1>
            <p className="mt-1 text-sm text-[#8d8d98]">
              Connect external AI providers via secure server-side session storage. Keys never enter browser storage.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#111115] px-4 py-2 text-xs font-semibold text-[#C9C9D1] transition-colors hover:border-[#FF263F]/60 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5 text-[#FF263F]" />
            <span>Clear Temporary Credentials</span>
          </button>
        </div>

        {/* Provider Selector Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => {
            const st = vaultStatus?.providers[p.id];
            const isSelected = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProvider(p.id)}
                className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-[#A40019] bg-[#161217] shadow-[0_0_24px_-8px_rgba(255,38,63,0.4)]'
                    : 'border-white/10 bg-[#111115] hover:border-white/25'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span
                    className={`text-[11px] font-medium ${
                      st?.connected ? 'text-emerald-400' : 'text-[#777780]'
                    }`}
                  >
                    {st?.connected ? 'Connected' : 'Unset'}
                  </span>
                </div>
                <span className="mt-1 text-xs text-[#777780]">{p.subtitle}</span>
              </button>
            );
          })}
        </div>

        {/* Configuration Card */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-xl border border-white/10 bg-[#111115] p-6 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  {PROVIDERS.find((p) => p.id === selectedProvider)?.name} Credentials
                </h2>
                <p className="mt-0.5 text-xs text-[#8d8d98]">
                  {currentStatus.source === 'environment'
                    ? 'Active via server-side environment configuration.'
                    : currentStatus.source === 'session'
                      ? `Active via temporary session vault (expires in ~${expiresInMin} min).`
                      : 'No credential currently active for this provider.'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium">
                {currentStatus.connected ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#777780]">
                    <AlertCircle className="h-4 w-4" />
                    <span>Not Connected</span>
                  </span>
                )}
              </div>
            </div>

            {currentStatus.maskedKey && (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b0b0e] px-4 py-2.5 text-xs">
                <span className="text-[#8d8d98]">Stored Masked Credential</span>
                <span className="font-mono text-[#e5e5ee]">{currentStatus.maskedKey}</span>
              </div>
            )}

            {/* API Key Input */}
            <div>
              <label htmlFor="vault-api-key" className="block text-xs font-medium text-[#9e9ea9]">
                {selectedProvider === 'gemini'
                  ? 'Optional Session Override Key (Gemini works automatically via environment)'
                  : 'API Key'}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="vault-api-key"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    selectedProvider === 'gemini'
                      ? 'Leave blank to use built-in Gemini configuration'
                      : 'Enter provider API key...'
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0b0b0e] py-2.5 pl-3.5 pr-11 font-mono text-sm text-white placeholder-[#686872] focus:border-[#FF263F] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute inset-y-0 right-2 inline-flex items-center px-2 text-[#8d8d98] hover:text-white"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Custom Endpoint fields */}
            {selectedProvider === 'custom' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="vault-endpoint" className="block text-xs font-medium text-[#9e9ea9]">
                    HTTPS Base Endpoint
                  </label>
                  <input
                    id="vault-endpoint"
                    type="url"
                    value={endpointInput}
                    onChange={(e) => setEndpointInput(e.target.value)}
                    placeholder="https://api.groq.com/openai/v1"
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3.5 py-2 text-sm text-white placeholder-[#686872] focus:border-[#FF263F] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="vault-custom-model" className="block text-xs font-medium text-[#9e9ea9]">
                    Default Model ID
                  </label>
                  <input
                    id="vault-custom-model"
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="llama-3.3-70b-versatile"
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3.5 py-2 text-sm text-white placeholder-[#686872] focus:border-[#FF263F] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Model Selection + Session Expiration */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="vault-model-select" className="block text-xs font-medium text-[#9e9ea9]">
                  Active Model
                </label>
                <select
                  id="vault-model-select"
                  value={
                    providerModels.some((m) => m.id === config.modelId)
                      ? config.modelId
                      : providerModels[0]?.id ?? ''
                  }
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      provider: selectedProvider,
                      modelId: e.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
                >
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="vault-ttl" className="block text-xs font-medium text-[#9e9ea9]">
                  Session Credential Expiration
                </label>
                <select
                  id="vault-ttl"
                  value={ttlMinutes}
                  onChange={(e) => setTtlMinutes(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={240}>4 hours</option>
                </select>
              </div>
            </div>

            {feedback && (
              <div
                role="status"
                className={`rounded-lg border px-4 py-2.5 text-xs ${
                  feedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                    : 'border-[#FF263F]/50 bg-[#A40019]/20 text-[#ffb3bc]'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={busy || !apiKeyInput.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#A40019] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#c2001e] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#6f6f78] whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Verify & Save to Session</span>
              </button>

              <button
                type="button"
                onClick={handleTest}
                disabled={busy || (!apiKeyInput.trim() && !currentStatus.connected)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#191920] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:border-[#FF263F]/60 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <PlugZap className="h-4 w-4 text-[#FF263F]" />
                <span>Test Connection</span>
              </button>

              {currentStatus.source === 'session' && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-xs font-semibold text-[#C9C9D1] transition-colors hover:border-white/35 hover:text-white disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Unplug className="h-4 w-4" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Security Architecture Summary */}
          <aside className="space-y-4 rounded-xl border border-white/10 bg-[#111115] p-6 lg:col-span-4">
            <h3 className="font-display text-base font-semibold text-white">
              Credential Architecture
            </h3>
            <ul className="space-y-3 text-xs leading-relaxed text-[#9595a0]">
              <li>
                All provider API requests are dispatched exclusively through the Express server proxy.
              </li>
              <li>
                User-supplied keys remain strictly in ephemeral server-side memory bound to your session token and automatically expire after the selected TTL.
              </li>
              <li>
                Custom endpoints require HTTPS and block loopback or private network targets.
              </li>
              <li>
                No credentials are written to browser storage, logs, or client bundles.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
};
