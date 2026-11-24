import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Calculator, Coins, RotateCcw, Trash2 } from 'lucide-react';
import {
  aggregateUsageAnalytics,
  calculateEstimatedCost,
  estimateTokenCount,
  getModelSpec,
  MODEL_CATALOG,
  type PricingOverride,
  type UsageRecord,
} from '../lib/kuroganeLogic';

interface ObservatoryProps {
  usageRecords: UsageRecord[];
  pricingOverrides: Record<string, PricingOverride>;
  onUpdatePricing: (next: Record<string, PricingOverride>) => void;
  onClearAnalytics: () => void;
  sessionToken: string;
}

export const Observatory: React.FC<ObservatoryProps> = ({
  usageRecords,
  pricingOverrides,
  onUpdatePricing,
  onClearAnalytics,
  sessionToken,
}) => {
  const analytics = useMemo(
    () => aggregateUsageAnalytics(usageRecords, pricingOverrides),
    [usageRecords, pricingOverrides],
  );

  // Live Token Calculator state
  const [calcText, setCalcText] = useState(
    'Explain how distributed consensus protocols preserve linearizability under network partitions.',
  );
  const [calcModelId, setCalcModelId] = useState('gemini-4-hydrogen');
  const [calcTokens, setCalcTokens] = useState<number>(() =>
    estimateTokenCount(
      'Explain how distributed consensus protocols preserve linearizability under network partitions.',
      'gemini',
    ),
  );
  const [calcExact, setCalcExact] = useState(false);

  const calcModel = getModelSpec(calcModelId);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!calcText.trim()) {
        setCalcTokens(0);
        setCalcExact(true);
        return;
      }
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sessionToken) headers['X-Kurogane-Session'] = sessionToken;
        const res = await fetch('/api/tokens/count', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: calcText,
            provider: calcModel.provider,
            modelId: calcModel.id,
          }),
        });
        if (!res.ok) throw new Error('fallback');
        const data = (await res.json()) as { tokens: number; exact: boolean };
        if (!cancelled) {
          setCalcTokens(data.tokens);
          setCalcExact(data.exact);
        }
      } catch {
        if (!cancelled) {
          setCalcTokens(estimateTokenCount(calcText, calcModel.provider));
          setCalcExact(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [calcText, calcModel.id, calcModel.provider, sessionToken]);

  const calcEstimatedInputCost = calculateEstimatedCost(
    calcTokens,
    0,
    calcModel,
    pricingOverrides[calcModel.id],
  );

  const [pricingModelId, setPricingModelId] = useState('gemini-4-hydrogen');
  const activePricingSpec = getModelSpec(pricingModelId);
  const activePricing = pricingOverrides[pricingModelId] ?? {
    inputPer1M: activePricingSpec.inputPricePer1M,
    outputPer1M: activePricingSpec.outputPricePer1M,
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-[#FF263F] uppercase">
              <Activity className="h-3.5 w-3.5" />
              <span>Token Analytics</span>
            </div>
            <h1 className="font-display mt-1 text-2xl sm:text-3xl font-semibold tracking-wider text-white">
              THE OBSERVATORY
            </h1>
            <p className="mt-1 text-sm text-[#8d8d98]">
              Real-time token telemetry, model breakdown, and configurable cost estimates across your sessions.
            </p>
          </div>
          {usageRecords.length > 0 && (
            <button
              type="button"
              onClick={onClearAnalytics}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#111115] px-4 py-2 text-xs font-semibold text-[#C9C9D1] transition-colors hover:border-[#FF263F]/60 hover:text-white whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-[#FF263F]" />
              <span>Clear Usage History</span>
            </button>
          )}
        </div>

        {/* KPI Summary Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-[#111115] p-4">
            <span className="text-xs text-[#8d8d98]">Input Tokens</span>
            <p className="font-mono-tabular mt-1.5 text-2xl font-semibold text-white">
              {analytics.totalInputTokens.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111115] p-4">
            <span className="text-xs text-[#8d8d98]">Output Tokens</span>
            <p className="font-mono-tabular mt-1.5 text-2xl font-semibold text-white">
              {analytics.totalOutputTokens.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111115] p-4">
            <span className="text-xs text-[#8d8d98]">Total Tokens</span>
            <p className="font-mono-tabular mt-1.5 text-2xl font-semibold text-[#FF263F]">
              {analytics.totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111115] p-4">
            <span className="text-xs text-[#8d8d98]">Avg Tokens / Request</span>
            <p className="font-mono-tabular mt-1.5 text-2xl font-semibold text-white">
              {analytics.averageTokensPerRequest.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111115] p-4">
            <span className="text-xs text-[#8d8d98]">
              Est. Cost (Non-billing)
            </span>
            <p className="font-mono-tabular mt-1.5 text-2xl font-semibold text-white">
              ${analytics.totalEstimatedCost.toFixed(4)}
            </p>
          </div>
        </div>

        {/* Charts Row */}
        {analytics.requestCount === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#111115] p-8 text-center">
            <p className="font-display text-base font-semibold text-white">
              No invocations recorded yet
            </p>
            <p className="mt-1.5 text-sm text-[#8d8d98]">
              Send a message in Chat to populate live token usage over time, input/output ratios, and model spending comparisons.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Token Usage Over Time */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  Token Usage Over Time
                </h2>
                <span className="text-xs text-[#777780]">
                  {analytics.hasEstimatedRecords ? 'Includes estimated counts' : 'Exact provider counts'}
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.timeSeries}>
                    <defs>
                      <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9C9D1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#C9C9D1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF263F" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#A40019" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="#777780" fontSize={11} />
                    <YAxis stroke="#777780" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0b0e',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#e5e5ee',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="inputTokens"
                      name="Input Tokens"
                      stroke="#C9C9D1"
                      fillOpacity={1}
                      fill="url(#inGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="outputTokens"
                      name="Output Tokens"
                      stroke="#FF263F"
                      fillOpacity={1}
                      fill="url(#outGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Input vs Output & Model Comparison */}
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  Model Input vs Output Comparison
                </h2>
                <span className="text-xs text-[#777780]">
                  {analytics.byModel.length} model{analytics.byModel.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.byModel}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="modelName" stroke="#777780" fontSize={11} />
                    <YAxis stroke="#777780" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0b0b0e',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#e5e5ee',
                      }}
                    />
                    <Bar dataKey="inputTokens" name="Input Tokens" fill="#8d8d98" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outputTokens" name="Output Tokens" fill="#A40019" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}

        {/* Model-wise & Conversation Usage Tables */}
        {analytics.requestCount > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-white/10 bg-[#111115] p-5">
              <h2 className="font-display mb-3 text-base font-semibold text-white">
                Model-Wise Usage & Estimated Spend
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-[#8d8d98]">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Model</th>
                      <th className="py-2 px-3 text-right font-medium">Reqs</th>
                      <th className="py-2 px-3 text-right font-medium">Total Tok</th>
                      <th className="py-2 pl-3 text-right font-medium">Est. USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {analytics.byModel.map((m) => (
                      <tr key={m.modelId}>
                        <td className="py-2.5 pr-3 font-medium text-white">{m.modelName}</td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#C9C9D1]">
                          {m.requests}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#C9C9D1]">
                          {m.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#FF263F]">
                          ${m.estimatedCost.toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[#111115] p-5">
              <h2 className="font-display mb-3 text-base font-semibold text-white">
                Conversation Token Ledger
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-[#8d8d98]">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Conversation</th>
                      <th className="py-2 px-3 text-right font-medium">Input</th>
                      <th className="py-2 px-3 text-right font-medium">Output</th>
                      <th className="py-2 pl-3 text-right font-medium">Est. USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {analytics.byConversation.slice(0, 8).map((c) => (
                      <tr key={c.conversationId}>
                        <td className="max-w-[180px] truncate py-2.5 pr-3 font-medium text-white">
                          {c.title}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#C9C9D1]">
                          {c.inputTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#C9C9D1]">
                          {c.outputTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#FF263F]">
                          ${c.estimatedCost.toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* Token Calculator & Configurable Pricing */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-[#FF263F]" />
                <h2 className="font-display text-base font-semibold text-white">
                  Token Calculator
                </h2>
              </div>
              <span className="text-xs text-[#8d8d98]">
                {calcExact ? 'Exact (Gemini Tokenizer)' : 'Estimated (Heuristic)'}
              </span>
            </div>

            <div>
              <label htmlFor="obs-calc-model" className="block text-xs font-medium text-[#9e9ea9]">
                Target Model
              </label>
              <select
                id="obs-calc-model"
                value={calcModelId}
                onChange={(e) => setCalcModelId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
              >
                {MODEL_CATALOG.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="obs-calc-text" className="block text-xs font-medium text-[#9e9ea9]">
                Sample Prompt / Context
              </label>
              <textarea
                id="obs-calc-text"
                rows={4}
                value={calcText}
                onChange={(e) => setCalcText(e.target.value)}
                placeholder="Paste text or code to measure tokens..."
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-[#0b0b0e] px-4 py-3">
              <div>
                <span className="block text-[11px] text-[#777780]">Token Count</span>
                <span className="font-mono-tabular text-xl font-semibold text-white">
                  {calcTokens.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#777780]">Characters</span>
                <span className="font-mono-tabular text-xl font-semibold text-[#C9C9D1]">
                  {calcText.length.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[11px] text-[#777780]">Est. Input Cost</span>
                <span className="font-mono-tabular text-xl font-semibold text-[#FF263F]">
                  ${calcEstimatedInputCost.toFixed(6)}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#111115] p-5 space-y-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-[#FF263F]" />
                <h2 className="font-display text-base font-semibold text-white">
                  Rate Calibration
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onUpdatePricing({})}
                className="inline-flex items-center gap-1 text-xs text-[#9e9ea9] hover:text-white"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Rates</span>
              </button>
            </div>

            <p className="text-xs text-[#777780]">
              Cost figures are non-binding estimates calculated from the per-million token rates below.
            </p>

            <div>
              <label htmlFor="obs-rate-model" className="block text-xs font-medium text-[#9e9ea9]">
                Model to Configure
              </label>
              <select
                id="obs-rate-model"
                value={pricingModelId}
                onChange={(e) => setPricingModelId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 text-sm text-white focus:border-[#FF263F] focus:outline-none"
              >
                {MODEL_CATALOG.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="obs-rate-in" className="block text-xs font-medium text-[#9e9ea9]">
                  Input ($ / 1M tok)
                </label>
                <input
                  id="obs-rate-in"
                  type="number"
                  min={0}
                  step={0.05}
                  value={activePricing.inputPer1M}
                  onChange={(e) =>
                    onUpdatePricing({
                      ...pricingOverrides,
                      [pricingModelId]: {
                        ...activePricing,
                        inputPer1M: Math.max(0, parseFloat(e.target.value) || 0),
                      },
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 font-mono-tabular text-sm text-white focus:border-[#FF263F] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="obs-rate-out" className="block text-xs font-medium text-[#9e9ea9]">
                  Output ($ / 1M tok)
                </label>
                <input
                  id="obs-rate-out"
                  type="number"
                  min={0}
                  step={0.05}
                  value={activePricing.outputPer1M}
                  onChange={(e) =>
                    onUpdatePricing({
                      ...pricingOverrides,
                      [pricingModelId]: {
                        ...activePricing,
                        outputPer1M: Math.max(0, parseFloat(e.target.value) || 0),
                      },
                    })
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#0b0b0e] px-3 py-2 font-mono-tabular text-sm text-white focus:border-[#FF263F] focus:outline-none"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
