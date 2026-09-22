import { jsonInstruction } from '../schema';
import type { ProviderAdapter } from '../types';
import { apiErrorMessage, collectSources } from '../utils';

const LABEL = 'Mistral';

export const mistralAdapter: ProviderAdapter = {
  info: {
    id: 'mistral',
    label: LABEL,
    defaultModel: 'pixtral-large-latest',
    suggestedModels: ['pixtral-large-latest', 'mistral-medium-latest', 'pixtral-12b-latest'],
    // L'API chat/completions n'expose pas d'outil de recherche web.
    supportsWebSearch: false,
    keyUrl: 'https://console.mistral.ai/api-keys',
    envKey: 'MISTRAL_API_KEY',
    hint: 'Clé de la console Mistral. Pas de recherche web : l’estimation reste indicative.',
  },

  async analyze(call) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      signal: call.signal,
      headers: {
        Authorization: `Bearer ${call.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: call.model,
        temperature: 0.2,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: call.prompt + jsonInstruction(call.schema) },
            ...call.imagesDataUrl.map((image_url) => ({ type: 'image_url', image_url })),
          ],
        }],
      }),
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));

    const text: string = String(raw?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error(`${LABEL} n’a pas renvoyé de résultat exploitable.`);
    return {
      text,
      sources: collectSources(raw),
      usage: {
        inputTokens: Number(raw?.usage?.prompt_tokens) || 0,
        outputTokens: Number(raw?.usage?.completion_tokens) || 0,
        webSearches: 0,
      },
    };
  },

  async listModels(apiKey, signal) {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));
    return (raw?.data ?? []).map((x: any) => String(x?.id)).filter(Boolean).sort();
  },
};
