import type { ProviderAdapter } from '../types';
import { apiErrorMessage, collectSources } from '../utils';

const LABEL = 'OpenAI';

export const openaiAdapter: ProviderAdapter = {
  info: {
    id: 'openai',
    label: LABEL,
    defaultModel: 'gpt-6-astra',
    suggestedModels: ['gpt-6-astra', 'gpt-5.1', 'gpt-5-mini', 'gpt-4.1'],
    supportsWebSearch: true,
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    envKey: 'OPENAI_API_KEY',
    hint: 'Clé du tableau de bord OpenAI (commence par sk-). Facturation à l’usage.',
  },

  async analyze(call) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: call.signal,
      headers: {
        Authorization: `Bearer ${call.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: call.model,
        store: false,
        reasoning: { effort: 'low' },
        ...(call.webSearch
          ? { tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'] }
          : {}),
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: call.prompt },
            ...call.imagesDataUrl.map((image_url) => ({ type: 'input_image', image_url, detail: 'auto' })),
          ],
        }],
        text: {
          format: { type: 'json_schema', name: call.schemaName, strict: true, schema: call.schema },
        },
      }),
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));

    const text: string | undefined = raw.output_text ?? raw.output
      ?.flatMap((item: any) => item?.content ?? [])
      ?.find((part: any) => part?.type === 'output_text')?.text;

    if (!text) throw new Error(`${LABEL} n’a pas renvoyé de résultat exploitable.`);
    return {
      text,
      sources: collectSources(raw),
      usage: {
        inputTokens: Number(raw?.usage?.input_tokens) || 0,
        outputTokens: Number(raw?.usage?.output_tokens) || 0,
        webSearches: (raw?.output ?? []).filter((item: any) => item?.type === 'web_search_call').length,
      },
    };
  },

  async listModels(apiKey, signal) {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const raw = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(LABEL, response.status, raw));
    return (raw?.data ?? []).map((x: any) => String(x?.id)).filter(Boolean).sort();
  },
};
