import { getAdapter } from './providers';
import {
  ANALYSIS_SCHEMA,
  BUY_SCHEMA,
  buildBuyPrompt,
  IDENTIFY_SCHEMA,
  IDENTITY_FIELDS,
  MARKET_SCHEMA,
  buildIdentifyPrompt,
  buildMarketPrompt,
  buildPrompt,
} from './schema';
import type { AnalyzeInput, AnalyzeResult, BuyContext, BuyResult, ProviderId, Seasonality, Usage } from './types';
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

/** Fiche d'identification (étape 1). */
export type Identity = Pick<AnalyzeResult,
  'objectName' | 'brand' | 'model' | 'reference' | 'category' | 'condition' | 'confidence' |
  'detectedText' | 'visibleDetails' | 'defects' | 'identificationWarnings' | 'keywords'> & {
  usage?: Usage;
  provider?: ProviderId;
  usedModel?: string;
};

const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };

export function addUsage(a?: Usage, b?: Usage): Usage {
  return {
    inputTokens: (a?.inputTokens || 0) + (b?.inputTokens || 0),
    outputTokens: (a?.outputTokens || 0) + (b?.outputTokens || 0),
    webSearches: (a?.webSearches || 0) + (b?.webSearches || 0),
  };
}

function resolve(options: AnalyzeOptions) {
  const adapter = getAdapter(options.provider);
  const model = (options.model || '').trim() || adapter.info.defaultModel;
  const webSearch = (options.webSearch ?? true) && adapter.info.supportsWebSearch;
  if (!options.apiKey?.trim()) throw new Error(`Aucune clé API renseignée pour ${adapter.info.label}.`);
  return { adapter, model, webSearch, apiKey: options.apiKey.trim() };
}

function checkImages(input: AnalyzeInput): string[] {
  const images = (input.imagesDataUrl ?? [])
    .filter((x) => typeof x === 'string' && x.startsWith('data:image/'))
    .slice(0, MAX_IMAGES);
  if (!images.length) throw new Error('Ajoute au moins une photo de l’objet.');
  if (images.some((x) => x.length > MAX_IMAGE_CHARS)) {
    throw new Error('Une photo est trop volumineuse. Reprends-la avec une qualité plus faible.');
  }
  return images;
}

/* ------------------------------------------------------------------ */
/* Étape 1 : identification (photos, sans recherche web)              */
/* ------------------------------------------------------------------ */

export async function identifyObject(input: AnalyzeInput, options: AnalyzeOptions): Promise<Identity> {
  const { adapter, model, apiKey } = resolve(options);
  const raw = await adapter.analyze({
    apiKey, model, webSearch: false, signal: options.signal,
    prompt: buildIdentifyPrompt(input),
    schema: IDENTIFY_SCHEMA, schemaName: 'resale_identify',
    imagesDataUrl: checkImages(input),
  });
  const parsed = extractJson<Partial<AnalyzeResult>>(raw.text);
  return { ...normalizeIdentity(parsed), usage: raw.usage, provider: options.provider, usedModel: model };
}

/* ------------------------------------------------------------------ */
/* Étape 2 : marché (fiche d'identification, avec recherche web)      */
/* ------------------------------------------------------------------ */

export async function studyMarket(input: AnalyzeInput, identity: Partial<Identity>, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { adapter, model, webSearch, apiKey } = resolve(options);
  const fiche = normalizeIdentity(identity);
  const raw = await adapter.analyze({
    apiKey, model, webSearch, signal: options.signal,
    prompt: buildMarketPrompt(input, fiche, { webSearch }),
    schema: MARKET_SCHEMA, schemaName: 'resale_market',
    imagesDataUrl: [],
  });
  const market = extractJson<Partial<AnalyzeResult>>(raw.text);
  return normalizeResult({ ...market, ...fiche }, {
    sources: raw.sources,
    provider: options.provider,
    usedModel: model,
    usage: addUsage(identity.usage, raw.usage),
  });
}

/* ------------------------------------------------------------------ */
/* Mode « Acheter » : combien payer (fiche d'identification + web)     */
/* ------------------------------------------------------------------ */

export async function studyPurchase(
  input: AnalyzeInput,
  identity: Partial<Identity>,
  options: AnalyzeOptions & { context: BuyContext; askingPrice?: number },
): Promise<BuyResult> {
  const { adapter, model, webSearch, apiKey } = resolve(options);
  const fiche = normalizeIdentity(identity);
  const raw = await adapter.analyze({
    apiKey, model, webSearch, signal: options.signal,
    prompt: buildBuyPrompt(input, fiche, { webSearch, context: options.context, askingPrice: options.askingPrice }),
    schema: BUY_SCHEMA, schemaName: 'resale_buy',
    imagesDataUrl: [],
  });
  const parsed = extractJson<Partial<BuyResult>>(raw.text);
  return normalizeBuy(parsed, fiche, {
    context: options.context,
    sources: raw.sources,
    provider: options.provider,
    usedModel: model,
    usage: addUsage(identity.usage, raw.usage),
  });
}

/* ------------------------------------------------------------------ */
/* Analyse complète en un appel (application mobile)                  */
/* ------------------------------------------------------------------ */

export async function analyzeObject(input: AnalyzeInput, options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { adapter, model, webSearch, apiKey } = resolve(options);
  const raw = await adapter.analyze({
    apiKey, model, webSearch, signal: options.signal,
    prompt: buildPrompt(input, { webSearch }),
    schema: ANALYSIS_SCHEMA, schemaName: 'resale_analysis',
    imagesDataUrl: checkImages(input),
  });
  const parsed = extractJson<Partial<AnalyzeResult>>(raw.text);
  return normalizeResult(parsed, { sources: raw.sources, provider: options.provider, usedModel: model, usage: raw.usage });
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

const clamp01 = (value: unknown, fallback: number) => Math.min(1, Math.max(0, num(value, fallback)));

const httpUrl = (value: unknown) => (/^https?:\/\//i.test(str(value)) ? str(value) : '');

export function normalizeIdentity(parsed: Partial<AnalyzeResult>): Identity {
  const out: Record<string, unknown> = {
    objectName: str(parsed.objectName, 'Objet non identifié'),
    brand: str(parsed.brand),
    model: str(parsed.model),
    reference: str(parsed.reference),
    category: str(parsed.category),
    condition: str(parsed.condition),
    confidence: clamp01(parsed.confidence, 0.5),
    detectedText: list(parsed.detectedText),
    visibleDetails: list(parsed.visibleDetails),
    defects: list(parsed.defects),
    identificationWarnings: list(parsed.identificationWarnings),
    keywords: list(parsed.keywords),
  };
  // Garde-fou : uniquement les champs d'identification.
  return Object.fromEntries(IDENTITY_FIELDS.map((k) => [k, out[k]])) as Identity;
}

/** Saisonnalité : 12 valeurs 0-100, niveau cohérent avec le mois en cours. */
function season(raw: unknown): Seasonality {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Seasonality>;
  const values = Array.isArray(s.monthlyDemand) ? s.monthlyDemand.map((v) => Math.min(100, Math.max(0, Math.round(num(v, 50))))) : [];
  const monthlyDemand = Array.from({ length: 12 }, (_, i) => values[i] ?? 50);
  const current = monthlyDemand[new Date().getMonth()];
  const derived: Seasonality['currentLevel'] = current >= 67 ? 'haute' : current >= 34 ? 'moyenne' : 'basse';
  const currentLevel = s.currentLevel === 'basse' || s.currentLevel === 'moyenne' || s.currentLevel === 'haute' ? s.currentLevel : derived;
  return { monthlyDemand, currentLevel, advice: str(s.advice) };
}

/** Délais de vente cohérents : croissants avec le prix, bas ≤ haut. */
function speeds(parsed: Partial<AnalyzeResult>) {
  const d = (v: unknown, f: number) => Math.max(0, Math.round(num(v, f)));
  const sLow = d(parsed.saleSpeedDaysLow, 3);
  const sHigh = Math.max(sLow, d(parsed.saleSpeedDaysHigh, 21));
  const qLow = Math.min(sLow, d(parsed.quickSaleDaysLow, Math.round(sLow * 0.5)));
  const qHigh = Math.min(sHigh, Math.max(qLow, d(parsed.quickSaleDaysHigh, Math.round(sHigh * 0.5))));
  const hLow = Math.max(sLow, d(parsed.highPriceDaysLow, sLow * 2));
  const hHigh = Math.max(sHigh, hLow, d(parsed.highPriceDaysHigh, sHigh * 2));
  return {
    saleSpeedDaysLow: sLow, saleSpeedDaysHigh: sHigh,
    quickSaleDaysLow: qLow, quickSaleDaysHigh: qHigh,
    highPriceDaysLow: hLow, highPriceDaysHigh: hHigh,
  };
}

export function normalizeBuy(
  parsed: Partial<BuyResult>,
  fiche: Identity,
  meta: { context: BuyContext; sources: BuyResult['sources']; provider: ProviderId; usedModel: string; usage?: Usage },
): BuyResult {
  const avg = Math.max(0, Math.round(num(parsed.averagePrice)));
  const good = Math.min(avg, Math.max(0, Math.round(num(parsed.goodDealPrice, Math.round(avg * 0.75)))));
  const tooMuch = Math.max(avg, Math.round(num(parsed.tooExpensivePrice, Math.round(avg * 1.3))));
  return {
    objectName: fiche.objectName, brand: fiche.brand, model: fiche.model, reference: fiche.reference,
    category: fiche.category, condition: fiche.condition, confidence: fiche.confidence,
    detectedText: fiche.detectedText, identificationWarnings: fiche.identificationWarnings,
    goodDealPrice: good,
    averagePrice: avg,
    tooExpensivePrice: tooMuch,
    priceConfidence: clamp01(parsed.priceConfidence, 0.5),
    askingPriceDetected: Math.max(0, Math.round(num(parsed.askingPriceDetected))),
    newPrice: Math.max(0, Math.round(num(parsed.newPrice))),
    newPriceSource: str(parsed.newPriceSource),
    newPriceUrl: httpUrl(parsed.newPriceUrl),
    marketBasis: str(parsed.marketBasis),
    comparables: Array.isArray(parsed.comparables)
      ? parsed.comparables.slice(0, 8).map((item: any) => ({
          label: str(item?.label, 'Comparable'),
          price: Math.max(0, Math.round(num(item?.price))),
          condition: str(item?.condition),
          source: str(item?.source),
          url: httpUrl(item?.url),
          status: item?.status === 'vendu' || item?.status === 'estimation' ? item.status : 'en vente',
        }))
      : [],
    checks: Array.isArray(parsed.checks)
      ? parsed.checks.slice(0, 8).map((c: any) => ({ point: str(c?.point), why: str(c?.why) })).filter((c) => c.point)
      : [],
    redFlags: list(parsed.redFlags),
    context: meta.context,
    sources: meta.sources ?? [],
    mode: 'ai',
    provider: meta.provider,
    usedModel: meta.usedModel,
    usage: meta.usage ?? ZERO_USAGE,
  };
}

export function normalizeResult(
  parsed: Partial<AnalyzeResult>,
  meta: { sources: AnalyzeResult['sources']; provider: ProviderId; usedModel: string; usage?: Usage },
): AnalyzeResult {
  const suggested = Math.max(0, Math.round(num(parsed.suggestedPrice)));
  const quick = Math.max(0, Math.round(num(parsed.quickSalePrice, Math.round(suggested * 0.85))));
  const floor = Math.min(suggested, Math.max(0, Math.round(num(parsed.negotiationFloor, Math.round(suggested * 0.9)))));
  const low = Math.max(0, Math.round(num(parsed.estimatedLow, Math.round(suggested * 0.8))));
  const high = Math.max(low, Math.round(num(parsed.estimatedHigh, Math.round(suggested * 1.2))));
  const demand = parsed.demand === 'faible' || parsed.demand === 'forte' ? parsed.demand : 'moyenne';
  const status = (v: unknown): 'vendu' | 'en vente' | 'estimation' =>
    (v === 'vendu' || v === 'en vente' || v === 'estimation' ? v : 'en vente');

  return {
    ...normalizeIdentity(parsed),
    priceConfidence: clamp01(parsed.priceConfidence, 0.5),
    quickSalePrice: quick,
    suggestedPrice: suggested,
    negotiationFloor: floor,
    estimatedLow: low,
    estimatedHigh: high,
    demand,
    seasonality: season(parsed.seasonality),
    newPrice: Math.max(0, Math.round(num(parsed.newPrice))),
    newPriceSource: str(parsed.newPriceSource),
    newPriceUrl: httpUrl(parsed.newPriceUrl),
    ...speeds(parsed),
    marketBasis: str(parsed.marketBasis),
    comparables: Array.isArray(parsed.comparables)
      ? parsed.comparables.slice(0, 8).map((item: any) => ({
          label: str(item?.label, 'Comparable'),
          price: Math.max(0, Math.round(num(item?.price))),
          condition: str(item?.condition),
          source: str(item?.source),
          url: httpUrl(item?.url),
          status: status(item?.status),
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
    usage: meta.usage ?? ZERO_USAGE,
  };
}
