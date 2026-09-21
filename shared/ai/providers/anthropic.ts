import { buildPrompt, jsonInstruction } from '../schema';
import type { ProviderAdapter } from '../types';
import { apiErrorMessage, collectSources, splitDataUrl } from '../utils';

const LABEL = 'Anthropic (Claude)';
const API_VERSION = '2023-06-01';

export const anthropicAdapter: ProviderAdapter = {
  info: {
    id: 'anthropic',
    label: LABEL,
    defaultModel: 'claude-opus-5',
    suggestedModels: ['claude-opus-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    supportsWebSearch: true,
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    envKey: 'ANTHROPIC_API_KEY',
    hint: 'Clé de la console Anthropic (commence par sk-ant-). Recherche web facturée séparément.',
  },

  async analyze(call) {
    const prompt = buildPrompt(call, { webSearch: call.webSearch }) + jsonInstruction();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: call.signal,
      headers: {
        'x-api-key': call.apiKey,
        'anthropic-version': API_VERSION,
        // Nécessaire lorsque la requête part d'un client (application mobile).
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: call.model,
        max_tokens: 8000,
        ...(call.webSearch
          ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }] }
          : {}),
        messages: [{
          role: 'user',
          content: [
            ...call.imagesDataUrl.map((dataUrl) => {
              const { mediaType, base64 } = splitDataUrl(dataUrl);
              return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
            }),
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));

    // On concatène les blocs texte : le JSON est dans le dernier bloc utile.
    const text: string = (raw?.content ?? [])
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => String(block.text ?? ''))
      .join('\n')
      .trim();

    if (!text) throw new Error(`${LABEL} n’a pas renvoyé de résultat exploitable.`);
    return { text, sources: collectSources(raw) };
  },

  async listModels(apiKey, signal) {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
    });
    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));
    return (raw?.data ?? []).map((x: any) => String(x?.id)).filter(Boolean);
  },
};
