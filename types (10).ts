/**
 * Types partagés entre le backend Next.js et l'application mobile.
 * Source unique de vérité : ne pas dupliquer ces types ailleurs.
 */

export type MarketSource = { title: string; url: string };

export type Comparable = {
  label: string;
  price: number;
  condition: string;
  source: string;
};

export type PlatformAdvice = {
  name: string;
  score: number;
  reason: string;
};

export type AnalyzeResult = {
  objectName: string;
  brand: string;
  model: string;
  reference: string;
  category: string;
  condition: string;
  confidence: number;
  priceConfidence: number;
  detectedText: string[];
  visibleDetails: string[];
  defects: string[];
  identificationWarnings: string[];
  keywords: string[];
  quickSalePrice: number;
  suggestedPrice: number;
  negotiationFloor: number;
  estimatedLow: number;
  estimatedHigh: number;
  demand: 'faible' | 'moyenne' | 'forte';
  saleSpeedDaysLow: number;
  saleSpeedDaysHigh: number;
  marketBasis: string;
  comparables: Comparable[];
  title: string;
  description: string;
  sellerTips: string[];
  platformAdvice: PlatformAdvice[];
  shippingAdvice: string;
  sources: MarketSource[];
  mode: 'ai' | 'demo';
  /** Fournisseur et modèle réellement utilisés (traçabilité de l'estimation). */
  provider?: ProviderId;
  usedModel?: string;
};

export type SaleStatus = 'draft' | 'listed' | 'sold';

export type SavedSale = AnalyzeResult & {
  id: string;
  createdAt: string;
  updatedAt: string;
  photoUri?: string;
  status: SaleStatus;
  askingPrice: number;
  soldPrice?: number;
  listedAt?: string;
  soldAt?: string;
  platform?: string;
  personalNote?: string;
};

/* ------------------------------------------------------------------ */
/* Couche fournisseurs d'IA                                            */
/* ------------------------------------------------------------------ */

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mistral';

/** Description statique d'un fournisseur, utilisée par l'écran Réglages. */
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  /** Modèle proposé par défaut. Toujours modifiable par l'utilisateur. */
  defaultModel: string;
  /** Quelques modèles vision connus, à titre de suggestion. */
  suggestedModels: string[];
  /** Le fournisseur sait-il chercher sur le web pendant l'analyse ? */
  supportsWebSearch: boolean;
  /** Début attendu de la clé (contrôle de saisie non bloquant). */
  keyPrefix?: string;
  /** Page de création de la clé. */
  keyUrl: string;
  /** Nom de la variable d'environnement correspondante côté backend. */
  envKey: string;
  /** Aide affichée sous le champ clé. */
  hint: string;
};

/** Contexte métier envoyé au modèle, indépendant du fournisseur. */
export type AnalyzeInput = {
  /** Photos en data URL : `data:image/jpeg;base64,...` (4 maximum). */
  imagesDataUrl: string[];
  notes?: string;
  knownReference?: string;
  locationHint?: string;
};

/** Paramètres d'appel résolus (clé + modèle déjà choisis). */
export type ProviderCall = AnalyzeInput & {
  apiKey: string;
  model: string;
  webSearch: boolean;
  signal?: AbortSignal;
};

/** Réponse brute normalisée d'un fournisseur. */
export type ProviderRawResult = {
  /** Texte JSON renvoyé par le modèle. */
  text: string;
  /** Sources web citées, si le fournisseur en expose. */
  sources: MarketSource[];
};

export type ProviderAdapter = {
  info: ProviderInfo;
  /** Lance l'analyse vision + recherche marché. */
  analyze(call: ProviderCall): Promise<ProviderRawResult>;
  /** Vérifie la clé et renvoie la liste des modèles disponibles. */
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
};
