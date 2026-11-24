import React, { useState } from 'react';
import { RotateCcw, Plus, X, Flame } from 'lucide-react';
import {
  buildSanitizedProviderPayload,
  clampTemperatureForModel,
  DEFAULT_FORGE_CONFIG,
  getModelSpec,
  getModelsForProvider,
  getTemperatureMode,
  MODEL_CATALOG,
  TOKEN_PRESETS,
  validateMaxOutputTokens,
  type ForgeConfig,
  type ProviderId,
  type ResponseLengthPreset,
  type ThinkingDepth,
} from '../lib/kuroganeLogic';

interface TheForgeProps {
  config: ForgeConfig;
  onChange: (next: ForgeConfig) => void;
}

export const TheForge: React.FC<TheForgeProps> = ({ config, onChange }) => {
  const [stopInput, setStopInput] = useState('');

  const selectedModel = getModelSpec(config.modelId);
  const providerModels = getModelsForProvider(config.provider);
  const tempMode = getTemperatureMode(config.temperature);
  const tokenValidation = validateMaxOutputTokens(config.maxOutputTokens, selectedModel);
  const sanitizedPreview = buildSanitizedProviderPayload(config, selectedModel);

  const handleProviderChange = (provider: ProviderId) => {
    const models = getModelsForProvider(provider);
    const nextModel = models[0] ?? MODEL_CATALOG[0];
    onChange({
      ...config,
      provider,
      modelId: nextModel.id,
      temperature: clampTemperatureForModel(config.temperature, nextModel),
      maxOutputTokens: validateMaxOutputTokens(config.maxOutputTokens, nextModel).value,
    });
  };

  const handleModelChange = (modelId: string) => {
    const nextModel = getModelSpec(modelId);
    onChange({
      ...config,
      provider: nextModel.provider,
      modelId: nextModel.id,
      temperature: clampTemperatureForModel(config.temperature, nextModel),
      maxOutputTokens: validateMaxOutputTokens(config.maxOutputTokens, nextModel).value,
      thinkingLevel:
        nextModel.supportedThinkingLevels &&
        !nextModel.supportedThinkingLevels.includes(config.thinkingLevel)
          ? nextModel.supportedThinkingLevels[0]
          : config.thinkingLevel,
    });
  };

  const addStopSequence = () => {
    const clean = stopInput.trim();
    if (!clean || config.stopSequences.includes(clean) || config.stopSequences.length >= 4) return;
    onChange({ ...config, stopSequences: [...config.stopSequences, clean] });
    setStopInput('');
  };

  const removeStopSequence = (seq: string) => {
    onChange({
      ...config,
      stopSequences: config.stopSequences.filter((s) => s !== seq),
    });
  };

  const contextRatioPct = Math.min(
    100,
    Math.max(1, (tokenValidation.value / selectedModel.contextWindow) * 100),
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-[#FF263F] uppercase">
              <Flame className="h-3.5 w-3.5" />
              <span>Control Center</span>
            </div>
            <h1 className="font-display mt-1 text-2xl sm:text-3xl font-semibold tracking-wider text-white">
              THE FORGE
            </h1>
            <p className="mt-1 text-sm text-[#8d8d98]">
              Calibrate reasoning depth, sampling parameters, and token boundaries before every invocation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FORGE_CONFIG })}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#111115] px-4 py-2 text-xs font-semibold text-[#C9C9D1] transition-colors hover:border-[#FF263F]/50 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Defaults</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Controls */}
          <div className="space-y-6 lg:col-span-7">
            {/* Model & Provider Selection */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4">
              <h2 className="font-display text-base font-semibold tracking-wide text-white">
                01. Model & Intelligence Core
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="forge-provider" className="block text-xs font-medium text-[#9e9ea9]">
                    Provider
                  </label>
                  <select
                    id="forge-provider"
                    value={config.provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
                  >
                    <option value="gemini">Google Gemini (Built-in / Vault)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="custom">Custom OpenAI-Compatible</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="forge-model" className="block text-xs font-medium text-[#9e9ea9]">
                    Model
                  </label>
                  <select
                    id="forge-model"
                    value={config.modelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
                  >
                    {providerModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {config.provider === 'custom' && (
                <div>
                  <label htmlFor="forge-custom-model" className="block text-xs font-medium text-[#9e9ea9]">
                    Custom Model Identifier
                  </label>
                  <input
                    id="forge-custom-model"
                    type="text"
                    value={config.customModelName ?? ''}
                    onChange={(e) => onChange({ ...config, customModelName: e.target.value })}
                    placeholder="e.g. llama-3.3-70b-versatile"
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white placeholder-[#686872] focus:border-[#FF263F] focus:outline-none"
                  />
                </div>
              )}

              <p className="text-xs text-[#777780]">{selectedModel.description}</p>
            </section>

            {/* Temperature Control */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-wide text-white">
                    02. Temperature
                  </h2>
                  <p className="text-xs text-[#8d8d98]">
                    {selectedModel.supportsTemperature
                      ? `${tempMode.label} · ${tempMode.description}`
                      : `${selectedModel.name} uses native adaptive calibration; temperature is omitted automatically.`}
                  </p>
                </div>
                <span className="font-mono-tabular text-lg font-semibold text-white">
                  {config.temperature.toFixed(2)}
                </span>
              </div>

              <div>
                <label htmlFor="forge-temperature" className="sr-only">
                  Temperature
                </label>
                <input
                  id="forge-temperature"
                  type="range"
                  min={selectedModel.minTemperature}
                  max={selectedModel.maxTemperature}
                  step={0.05}
                  disabled={!selectedModel.supportsTemperature}
                  value={clampTemperatureForModel(config.temperature, selectedModel)}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      temperature: clampTemperatureForModel(parseFloat(e.target.value), selectedModel),
                    })
                  }
                  className="w-full accent-[#A40019] disabled:opacity-40"
                />
                <div className="mt-1.5 flex justify-between font-mono-tabular text-[11px] text-[#777780]">
                  <span>0.0 Precision</span>
                  <span>0.7 Balanced</span>
                  {selectedModel.maxTemperature > 1 ? <span>1.2 Creative</span> : <span>1.0 Max</span>}
                  {selectedModel.maxTemperature >= 2 && <span>2.0 Experimental</span>}
                </div>
              </div>

              {/* Reasoning Depth when supported */}
              {selectedModel.supportsThinkingLevel && selectedModel.supportedThinkingLevels && (
                <div className="border-t border-white/10 pt-4">
                  <span className="block text-xs font-medium text-[#9e9ea9]">
                    Reasoning Depth (Thinking Level)
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedModel.supportedThinkingLevels.map((lvl: ThinkingDepth) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => onChange({ ...config, thinkingLevel: lvl })}
                        className={`rounded-md px-3 py-1.5 font-mono-tabular text-xs font-medium transition-colors ${
                          config.thinkingLevel === lvl
                            ? 'bg-[#A40019] text-white'
                            : 'border border-white/10 bg-[#0b0b0e] text-[#9e9ea9] hover:text-white'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Token Control */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-wide text-white">
                    03. Maximum Output Tokens
                  </h2>
                  <p className="text-xs text-[#8d8d98]">
                    Caps generated response length (separate from total context capacity).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="forge-max-tokens-num" className="sr-only">
                    Maximum output tokens numeric input
                  </label>
                  <input
                    id="forge-max-tokens-num"
                    type="number"
                    min={64}
                    max={selectedModel.maxOutputLimit}
                    step={64}
                    value={config.maxOutputTokens}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      onChange({
                        ...config,
                        maxOutputTokens: Number.isNaN(val) ? 512 : val,
                      });
                    }}
                    onBlur={() =>
                      onChange({
                        ...config,
                        maxOutputTokens: tokenValidation.value,
                      })
                    }
                    className="w-28 rounded-lg border border-white/15 bg-[#0b0b0e] px-2.5 py-1.5 text-right font-mono-tabular text-sm text-white focus:border-[#FF263F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="forge-max-tokens-slider" className="sr-only">
                  Maximum output tokens slider
                </label>
                <input
                  id="forge-max-tokens-slider"
                  type="range"
                  min={64}
                  max={Math.min(selectedModel.maxOutputLimit, 32768)}
                  step={64}
                  value={Math.min(tokenValidation.value, Math.min(selectedModel.maxOutputLimit, 32768))}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      maxOutputTokens: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-[#A40019]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {TOKEN_PRESETS.filter((p) => p <= selectedModel.maxOutputLimit).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ ...config, maxOutputTokens: preset })}
                    className={`rounded-md px-3 py-1.5 font-mono-tabular text-xs font-medium transition-colors ${
                      config.maxOutputTokens === preset
                        ? 'bg-[#A40019] text-white'
                        : 'border border-white/10 bg-[#0b0b0e] text-[#9e9ea9] hover:text-white'
                    }`}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              {tokenValidation.warning && (
                <p className="text-xs text-[#FF263F]">{tokenValidation.warning}</p>
              )}

              {/* Context Window vs Max Output visual */}
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0b0e] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#9e9ea9]">
                  <span>Output Allocation vs Total Context Window</span>
                  <span className="font-mono-tabular">
                    {tokenValidation.value.toLocaleString()} /{' '}
                    {selectedModel.contextWindow.toLocaleString()} tokens
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[#A40019] transition-all"
                    style={{ width: `${Math.max(2, contextRatioPct)}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono-tabular text-[11px] text-[#777780]">
                  <span>Model Output Max: {selectedModel.maxOutputLimit.toLocaleString()}</span>
                  <span>Context Window: {selectedModel.contextWindow.toLocaleString()}</span>
                </div>
              </div>
            </section>

            {/* Advanced Parameters */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-5">
              <h2 className="font-display text-base font-semibold tracking-wide text-white">
                04. Advanced Parameters
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="forge-top-p" className="font-medium text-[#9e9ea9]">
                      Top-P Nucleus
                    </label>
                    <span className="font-mono-tabular text-white">{config.topP.toFixed(2)}</span>
                  </div>
                  <input
                    id="forge-top-p"
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    disabled={!selectedModel.supportsTopP}
                    value={config.topP}
                    onChange={(e) => onChange({ ...config, topP: parseFloat(e.target.value) })}
                    className="mt-2 w-full accent-[#A40019] disabled:opacity-40"
                  />
                  {!selectedModel.supportsTopP && (
                    <p className="mt-1 text-[11px] text-[#777780]">
                      Omitted automatically for {selectedModel.name}.
                    </p>
                  )}
                </div>

                <div>
                  <span className="block text-xs font-medium text-[#9e9ea9]">Response Length</span>
                  <div className="mt-2 flex gap-1.5 rounded-lg bg-[#0b0b0e] p-1">
                    {(['concise', 'balanced', 'comprehensive'] as ResponseLengthPreset[]).map(
                      (len) => (
                        <button
                          key={len}
                          type="button"
                          onClick={() => onChange({ ...config, responseLength: len })}
                          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                            config.responseLength === len
                              ? 'bg-[#A40019] text-white'
                              : 'text-[#8d8d98] hover:text-white'
                          }`}
                        >
                          {len}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-3.5 py-2.5">
                <div>
                  <span className="block text-sm font-medium text-white">Real-Time Streaming</span>
                  <span className="text-xs text-[#777780]">
                    Stream tokens via Server-Sent Events as they are forged.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.streaming}
                  aria-label="Toggle streaming responses"
                  onClick={() => onChange({ ...config, streaming: !config.streaming })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.streaming ? 'bg-[#A40019]' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.streaming ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label htmlFor="forge-system-prompt" className="block text-xs font-medium text-[#9e9ea9]">
                  System Prompt (Blade Persona & Directives)
                </label>
                <textarea
                  id="forge-system-prompt"
                  rows={4}
                  value={config.systemPrompt}
                  onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm leading-relaxed text-white focus:border-[#FF263F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="forge-stop-seq" className="block text-xs font-medium text-[#9e9ea9]">
                  Stop Sequences (max 4)
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="forge-stop-seq"
                    type="text"
                    value={stopInput}
                    onChange={(e) => setStopInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addStopSequence();
                      }
                    }}
                    placeholder="Add stop sequence..."
                    className="flex-1 rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white placeholder-[#686872] focus:border-[#FF263F] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addStopSequence}
                    disabled={!stopInput.trim() || config.stopSequences.length >= 4}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#191920] px-3 py-2 text-xs font-medium text-white hover:border-[#FF263F]/60 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </div>
                {config.stopSequences.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {config.stopSequences.map((seq) => (
                      <span
                        key={seq}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[#0b0b0e] px-2.5 py-1 font-mono text-xs text-[#C9C9D1]"
                      >
                        <span>{seq}</span>
                        <button
                          type="button"
                          onClick={() => removeStopSequence(seq)}
                          aria-label={`Remove stop sequence ${seq}`}
                          className="text-[#777780] hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Live Configuration Preview */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold tracking-wide text-white">
                  Live Configuration Preview
                </h2>
                <p className="mt-1 text-xs text-[#777780]">
                  Exact sanitized request profile dispatched to the server proxy. Unsupported provider fields are automatically excluded.
                </p>
              </div>

              <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-[#07070a] p-4 font-mono text-xs leading-relaxed text-[#d4d4de]">
                {JSON.stringify(sanitizedPreview, null, 2)}
              </pre>

              {sanitizedPreview.omittedFields.length > 0 && (
                <p className="text-xs text-[#8e8e9a]">
                  Filtered for {selectedModel.name}:{' '}
                  <span className="font-mono text-[#C9C9D1]">
                    {sanitizedPreview.omittedFields.join(', ')}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
