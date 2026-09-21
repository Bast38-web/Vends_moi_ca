import { getAdapter } from './providers';
import type { AnalyzeInput, AnalyzeResult, ProviderId } from './types';
import { extractJson } from './utils';

/** Taille maximale acceptée pour une photo encodée en base64. */
export const MAX_IMAGE_CHARS = 6_500_000;
export const MAX_IMAGES = 4;

export type AnalyzeOptions = {
  provider: ProviderId;
  apiKey: string;
  model?: string;
  webSearch?: boolean;
  signal?: AbortSignal;
};

/**
 * Point d'entrée unique de l'analyse, quel que soit le fournisseur.
 * Utilisé tel quel par l'application mobile (appel direct) et par le backend
 * Next.js (clé côté serveur).
 */
export async function analyzeObject(input: AnalyzeInput, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const adapter = getAdapter(options.provider);
  const model = (options.model || '').trim() || adapter.info.defaultModel;
  const webSearch = (options.webSearch ?? true) && adapter.info.supportsWebSearch;

  if (!options.apiKey?.trim()) {
    throw new Error(`Aucune clé API renseignée pour ${adapter.info.label}.`);
  }

  const images = (input.imagesDataUrl ?? [])
    .filter((x) => typeof x === 'string' && x.startsWith('data:image/'))
    .slice(0, MAX_IMAGES);

  if (!images.length) throw new Error('Ajoute au moins une photo de l’objet.');
  if (images.some((x) => x.length > MAX_IMAGE_CHARS)) {
    throw new Error('Une photo est trop volumineuse. Reprends-la avec une qualité plus faible.');
  }

  const rawResult = await adapter.analyze({
    ...input,
    imagesDataUrl: images,
    apiKey: options.apiKey.trim(),
    model,
    webSearch,
    signal: options.signal,
  });

  const parsed = extractJson<Partial<AnalyzeResult>>(rawResult.text);

  return normalizeResult(parsed, {
    sources: rawResult.sources,
    provider: options.provider,
    usedModel: model,
  });
}

/* ------------------------------------------------------------------ */
/* Normalisation : une réponse de modèle n'est jamais garantie          */
/* ------------------------------------------------------------------ */

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.trim()) : [];

export function normalizeResult(
  parsed: Partial<AnalyzeResult>,
  meta: { sources: AnalyzeResult['sources']; provider: ProviderId; usedModel: string },
): AnalyzeResult {
  const suggested = Math.max(0, Math.round(num(parsed.suggestedPrice)));
  const quick = Math.max(0, Math.round(num(parsed.quickSalePrice, Math.round(suggested * 0.85))));
  const floor = Math.min(
    suggested,
    Math.max(0, Math.round(num(parsed.negotiationFloor, Math.round(suggested * 0.9)))),
  );
  const low = Math.max(0, Math.round(num(parsed.estimatedLow, Math.round(suggested * 0.8))));
  const high = Math.max(low, Math.round(num(parsed.estimatedHigh, Math.round(suggested * 1.2))));
  const demand = parsed.demand === 'faible' || parsed.demand === 'forte' ? parsed.demand : 'moyenne';
  const clamp01 = (value: unknown, fallback: number) => Math.min(1, Math.max(0, num(value, fallback)));

  return {
    objectName: str(parsed.objectName, 'Objet non identifié'),
    brand: str(parsed.brand),
    model: str(parsed.model),
    reference: str(parsed.reference),
    category: str(parsed.category),
    condition: str(parsed.condition),
    confidence: clamp01(parsed.confidence, 0.5),
    priceConfidence: clamp01(parsed.priceConfidence, 0.5),
    detectedText: list(parsed.detectedText),
    visibleDetails: list(parsed.visibleDetails),
    defects: list(parsed.defects),
    identificationWarnings: list(parsed.identificationWarnings),
    keywords: list(parsed.keywords),
    quickSalePrice: quick,
    suggestedPrice: suggested,
    negotiationFloor: floor,
    estimatedLow: low,
    estimatedHigh: high,
    demand,
    saleSpeedDaysLow: Math.max(0, Math.round(num(parsed.saleSpeedDaysLow, 3))),
    saleSpeedDaysHigh: Math.max(0, Math.round(num(parsed.saleSpeedDaysHigh, 21))),
    marketBasis: str(parsed.marketBasis),
    comparables: Array.isArray(parsed.comparables)
      ? parsed.comparables.slice(0, 8).map((item: any) => ({
          label: str(item?.label, 'Comparable'),
          price: Math.max(0, Math.round(num(item?.price))),
          condition: str(item?.condition),
          source: str(item?.source),
        }))
      : [],
    title: str(parsed.title, str(parsed.objectName)),
    description: str(parsed.description),
    sellerTips: list(parsed.sellerTips),
    platformAdvice: Array.isArray(parsed.platformAdvice)
      ? parsed.platformAdvice.slice(0, 4).map((item: any) => ({
          name: str(item?.name, 'Plateforme'),
          score: Math.min(100, Math.max(0, Math.round(num(item?.score, 50)))),
          reason: str(item?.reason),
          category: str(item?.category),
          condition: str(item?.condition),
        }))
      : [],
    shippingAdvice: str(parsed.shippingAdvice),
    sources: meta.sources ?? [],
    mode: 'ai',
    provider: meta.provider,
    usedModel: meta.usedModel,
  };
}
