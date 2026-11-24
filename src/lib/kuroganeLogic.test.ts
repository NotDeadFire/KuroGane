import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateUsageAnalytics,
  buildSanitizedProviderPayload,
  calculateEstimatedCost,
  clampTemperatureForModel,
  DEFAULT_FORGE_CONFIG,
  deriveConversationTitle,
  estimateTokenCount,
  filterAndSortConversations,
  getAwakeningPhaseAt,
  getModelSpec,
  getTemperatureMode,
  maskCredential,
  validateMaxOutputTokens,
  type Conversation,
  type UsageRecord,
} from './kuroganeLogic';

test('getTemperatureMode maps ranges accurately', () => {
  assert.equal(getTemperatureMode(0.0).label, 'Precision mode');
  assert.equal(getTemperatureMode(0.3).label, 'Precision mode');
  assert.equal(getTemperatureMode(0.7).label, 'Balanced mode');
  assert.equal(getTemperatureMode(1.1).label, 'Creative mode');
  assert.equal(getTemperatureMode(1.8).label, 'Experimental mode');
});

test('clampTemperatureForModel enforces Anthropic 1.0 ceiling and OpenAI 2.0 ceiling', () => {
  const claude = getModelSpec('claude-sonnet-4-20250514');
  const gpt = getModelSpec('gpt-4o');
  assert.equal(clampTemperatureForModel(1.7, claude), 1.0);
  assert.equal(clampTemperatureForModel(-0.5, claude), 0);
  assert.equal(clampTemperatureForModel(1.7, gpt), 1.7);
  assert.equal(clampTemperatureForModel(2.5, gpt), 2.0);
});

test('validateMaxOutputTokens enforces minimum and model-specific maximum', () => {
  const haiku = getModelSpec('claude-3-5-haiku-20241022');
  const low = validateMaxOutputTokens(10, haiku);
  assert.equal(low.value, 64);
  assert.equal(low.clamped, true);

  const high = validateMaxOutputTokens(20000, haiku);
  assert.equal(high.value, 8192);
  assert.equal(high.clamped, true);

  const ok = validateMaxOutputTokens(4096, haiku);
  assert.equal(ok.value, 4096);
  assert.equal(ok.clamped, false);
});

test('buildSanitizedProviderPayload strips unsupported parameters per model family', () => {
  const gemini4 = getModelSpec('gemini-4-hydrogen');
  const payloadG4 = buildSanitizedProviderPayload(
    {
      ...DEFAULT_FORGE_CONFIG,
      temperature: 1.4,
      topP: 0.8,
      thinkingLevel: 'HIGH',
      stopSequences: ['END', '  ', 'STOP'],
    },
    gemini4,
  );
  assert.equal(payloadG4.temperature, undefined);
  assert.equal(payloadG4.topP, undefined);
  assert.ok(payloadG4.omittedFields.includes('temperature'));
  assert.ok(payloadG4.omittedFields.includes('topP'));
  assert.equal(payloadG4.thinkingLevel, 'HIGH');
  assert.deepEqual(payloadG4.stopSequences, ['END', 'STOP']);

  const openai = getModelSpec('gpt-4o');
  const payloadOpenAI = buildSanitizedProviderPayload(
    {
      ...DEFAULT_FORGE_CONFIG,
      provider: 'openai',
      modelId: 'gpt-4o',
      temperature: 0.85,
      topP: 0.9,
      thinkingLevel: 'XHIGH',
    },
    openai,
  );
  assert.equal(payloadOpenAI.temperature, 0.85);
  assert.equal(payloadOpenAI.topP, 0.9);
  assert.equal(payloadOpenAI.thinkingLevel, undefined);
  assert.ok(payloadOpenAI.omittedFields.includes('thinkingLevel'));
});

test('estimateTokenCount and calculateEstimatedCost return consistent non-zero estimates', () => {
  const model = getModelSpec('gemini-4-hydrogen');
  const tokens = estimateTokenCount('Explain distributed consensus with TypeScript examples.', 'gemini');
  assert.ok(tokens > 8 && tokens < 30);
  const cost = calculateEstimatedCost(1_000_000, 1_000_000, model);
  assert.equal(cost, 0.75);

  const overridden = calculateEstimatedCost(1_000_000, 1_000_000, model, {
    inputPer1M: 1.0,
    outputPer1M: 2.0,
  });
  assert.equal(overridden, 3.0);
});

test('aggregateUsageAnalytics totals tokens, requests, averages, and groupings', () => {
  const records: UsageRecord[] = [
    {
      id: '1',
      conversationId: 'c1',
      conversationTitle: 'Blade Architecture',
      provider: 'gemini',
      modelId: 'gemini-4-hydrogen',
      inputTokens: 1000,
      outputTokens: 500,
      isExact: true,
      timestamp: new Date(2026, 10, 24, 10, 15).getTime(),
    },
    {
      id: '2',
      conversationId: 'c1',
      conversationTitle: 'Blade Architecture',
      provider: 'gemini',
      modelId: 'gemini-4-neon',
      inputTokens: 2000,
      outputTokens: 1000,
      isExact: false,
      timestamp: new Date(2026, 10, 24, 11, 15).getTime(),
    },
  ];
  const summary = aggregateUsageAnalytics(records);
  assert.equal(summary.totalInputTokens, 3000);
  assert.equal(summary.totalOutputTokens, 1500);
  assert.equal(summary.totalTokens, 4500);
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.averageTokensPerRequest, 2250);
  assert.equal(summary.hasEstimatedRecords, true);
  assert.equal(summary.byModel.length, 2);
  assert.equal(summary.byConversation.length, 1);
  assert.equal(summary.timeSeries.length, 2);
});

test('filterAndSortConversations searches title and message body and sorts newest first', () => {
  const convs: Conversation[] = [
    {
      id: 'a',
      title: 'Old Thread',
      createdAt: 100,
      updatedAt: 100,
      messages: [{ id: 'm1', role: 'user', content: 'quantum gates', createdAt: 100 }],
    },
    {
      id: 'b',
      title: 'TypeScript Locks',
      createdAt: 200,
      updatedAt: 300,
      messages: [{ id: 'm2', role: 'user', content: 'mutex design', createdAt: 300 }],
    },
  ];

  assert.deepEqual(
    filterAndSortConversations(convs, '').map((c) => c.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    filterAndSortConversations(convs, 'quantum').map((c) => c.id),
    ['a'],
  );
  assert.equal(maskCredential('sk-1234567890abcdef'), 'sk-1••••••••cdef');
  assert.equal(deriveConversationTitle('   Hello   Kurogane   '), 'Hello Kurogane');
});

test('getAwakeningPhaseAt progresses through silence, five-leaf grimoire, sword emergence, orbit, reveal, and ready', () => {
  assert.equal(getAwakeningPhaseAt(0), 'silence');
  assert.equal(getAwakeningPhaseAt(1499), 'silence');
  assert.equal(getAwakeningPhaseAt(1500), 'grimoire_manifest');
  assert.equal(getAwakeningPhaseAt(5200), 'sword_emerge');
  assert.equal(getAwakeningPhaseAt(9600), 'angle_grimoire');
  assert.equal(getAwakeningPhaseAt(14400), 'reveal');
  assert.equal(getAwakeningPhaseAt(17500), 'ready');
});

