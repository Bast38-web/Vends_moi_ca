import {
  analyzeObject,
  getAdapter,
  makeDemoResult,
  type AnalyzeInput,
  type AnalyzeResult,
} from '../../shared/ai';
import { loadApiKey, resolvedModel, type AppSettings } from './settings';

/**
 * Aiguillage unique de l'analyse côté application.
 * Le reste de l'interface n'a pas à savoir quel fournisseur est configuré.
 */
export async function runAnalysis(
  input: AnalyzeInput,
  settings: AppSettings,
  options: { forceDemo?: boolean; signal?: AbortSignal } = {},
): Promise<AnalyzeResult> {
  if (options.forceDemo || settings.mode === 'demo') {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return makeDemoResult();
  }

  if (settings.mode === 'backend') {
    return analyzeViaBackend(input, settings, options.signal);
  }

  const apiKey = await loadApiKey(settings.provider);
  if (!apiKey) {
    const label = getAdapter(settings.provider).info.label;
    throw new Error(`Aucune clé ${label} enregistrée. Ouvre Réglages pour la saisir.`);
  }

  return analyzeObject(input, {
    provider: settings.provider,
    apiKey,
    model: resolvedModel(settings),
    webSearch: settings.webSearch,
    signal: options.signal,
  });
}

async function analyzeViaBackend(
  input: AnalyzeInput,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  const base = settings.backendUrl.replace(/\/$/, '');
  if (!base) throw new Error('Aucune URL de backend renseignée dans Réglages.');

  const response = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      provider: settings.provider,
      model: resolvedModel(settings),
      webSearch: settings.webSearch,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Erreur pendant l’analyse côté serveur.');
  return data as AnalyzeResult;
}

/** Vérifie la clé d'un fournisseur et renvoie ses modèles disponibles. */
export async function testProviderKey(
  provider: Parameters<typeof getAdapter>[0],
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('Saisis d’abord une clé API.');
  return getAdapter(provider).listModels(apiKey.trim(), signal);
}

/** Vérifie que le backend répond et indique quels fournisseurs y sont configurés. */
export async function testBackend(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ version: string; providers: string[] }> {
  const base = backendUrl.replace(/\/$/, '');
  if (!base) throw new Error('Saisis d’abord l’URL du backend.');
  const response = await fetch(`${base}/api/health`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error('Le backend a répondu une erreur.');
  return {
    version: String(data?.version ?? '?'),
    providers: Array.isArray(data?.configuredProviders) ? data.configuredProviders : [],
  };
}
