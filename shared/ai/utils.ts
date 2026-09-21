import type { MarketSource } from './types';

/** Découpe une data URL en type MIME + charge utile base64. */
export function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error('Photo illisible : format data URL attendu.');
  return { mediaType: match[1], base64: match[2] };
}

/**
 * Extrait un objet JSON d'une réponse de modèle, même si celui-ci l'a entouré
 * de texte ou d'un bloc de code markdown.
 */
export function extractJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Repli : on isole le premier objet JSON équilibré.
    const start = cleaned.indexOf('{');
    if (start === -1) throw new Error('Le modèle n’a pas renvoyé de JSON exploitable.');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
    throw new Error('Le modèle n’a pas renvoyé de JSON exploitable.');
  }
}

/** Domaines techniques à ne jamais afficher comme source marché. */
const IGNORED_HOSTS = [
  'api.openai.com', 'api.anthropic.com', 'api.mistral.ai',
  'generativelanguage.googleapis.com', 'schema.org', 'json-schema.org',
];

/**
 * Parcourt une réponse brute (quel que soit le fournisseur) et collecte les URL
 * citées. Fonctionne pour OpenAI (web_search sources), Anthropic
 * (web_search_tool_result) et Gemini (groundingChunks).
 */
export function collectSources(value: unknown, limit = 10): MarketSource[] {
  const found = new Map<string, MarketSource>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const obj = node as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url : typeof obj.uri === 'string' ? obj.uri : '';
    if (url && /^https?:\/\//.test(url)) {
      let host = url;
      try { host = new URL(url).hostname; } catch { /* URL non standard : on garde l'URL brute */ }
      if (!IGNORED_HOSTS.includes(host)) {
        const rawTitle = typeof obj.title === 'string' ? obj.title : '';
        found.set(url, { title: rawTitle.trim() || host, url });
      }
    }
    for (const child of Object.values(obj)) visit(child);
  };

  visit(value);
  return [...found.values()].slice(0, limit);
}

/** Message d'erreur lisible à partir d'une réponse HTTP d'API. */
export function apiErrorMessage(providerLabel: string, status: number, raw: unknown): string {
  const obj = raw as Record<string, any> | null;
  const detail =
    obj?.error?.message ||
    obj?.error?.detail ||
    obj?.message ||
    (typeof raw === 'string' ? raw.slice(0, 300) : '');

  if (status === 401 || status === 403) {
    return `${providerLabel} : clé API refusée (${status}). Vérifie la clé dans Réglages.`;
  }
  if (status === 404) {
    return `${providerLabel} : modèle introuvable (404). Vérifie le nom du modèle dans Réglages.${detail ? ` — ${detail}` : ''}`;
  }
  if (status === 429) {
    return `${providerLabel} : quota ou limite de débit atteint (429). Réessaie dans quelques instants.`;
  }
  return `${providerLabel} : erreur ${status}${detail ? ` — ${detail}` : ''}`;
}
