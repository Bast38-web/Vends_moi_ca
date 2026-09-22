import { jsonInstruction } from '../schema';
import type { ProviderAdapter } from '../types';
import { apiErrorMessage, collectSources, splitDataUrl } from '../utils';

const LABEL = 'Google Gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiAdapter: ProviderAdapter = {
  info: {
    id: 'gemini',
    label: LABEL,
    defaultModel: 'gemini-2.5-pro',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    supportsWebSearch: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    envKey: 'GEMINI_API_KEY',
    hint: 'Clé Google AI Studio. Niveau gratuit disponible, avec quotas.',
  },

  async analyze(call) {
    // Google Search et le mode JSON strict ne se combinent pas : le format
    // JSON est imposé par le prompt.
    const model = call.model.replace(/^models\//, '');

    const response = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: call.signal,
      headers: { 'x-goog-api-key': call.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: call.prompt + jsonInstruction(call.schema) },
            ...call.imagesDataUrl.map((dataUrl) => {
              const { mediaType, base64 } = splitDataUrl(dataUrl);
              return { inline_data: { mime_type: mediaType, data: base64 } };
            }),
          ],
        }],
        ...(call.webSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: 0.2,
          ...(call.webSearch ? {} : { responseMimeType: 'application/json' }),
        },
      }),
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));

    const candidate = raw?.candidates?.[0];
    const text: string = (candidate?.content?.parts ?? [])
      .map((part: any) => String(part?.text ?? ''))
      .join('')
      .trim();

    if (!text) throw new Error(`${LABEL} n’a pas renvoyé de résultat exploitable.`);
    const meta = raw?.usageMetadata ?? {};
    const queries = candidate?.groundingMetadata?.webSearchQueries;
    return {
      text,
      sources: collectSources(candidate?.groundingMetadata ?? raw),
      usage: {
        inputTokens: Number(meta.promptTokenCount) || 0,
        outputTokens: (Number(meta.candidatesTokenCount) || 0) + (Number(meta.thoughtsTokenCount) || 0),
        // La recherche Google est facturée par requête d'origine, non par sous-requête.
        webSearches: Array.isArray(queries) && queries.length ? 1 : 0,
      },
    };
  },

  async listModels(apiKey, signal) {
    const response = await fetch(`${BASE}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    });
    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));
    return (raw?.models ?? [])
      .filter((x: any) => (x?.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((x: any) => String(x?.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
  },
};
