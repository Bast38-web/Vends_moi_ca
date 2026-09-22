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
  /** Adresse de l'annonce trouvée par la recherche web (vide si inconnue). */
  url?: string;
  /** « vendu » = transaction conclue (prix le plus fiable), « en vente » = annonce active. */
  status?: 'vendu' | 'en vente' | 'estimation';
};

/** Consommation d'une analyse (pour calculer son coût). */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
};

export type PlatformAdvice = {
  name: string;
  score: number;
  reason: string;
  /** Catégorie à choisir dans l'arborescence de la plateforme. */
  category?: string;
  /** État tel que libellé dans les choix de la plateforme. */
  condition?: string;
};

export type Seasonality = {
  /** Intensité de la demande de janvier à décembre, 0 à 100. */
  monthlyDemand: number[];
  /** Niveau de la saison au moment de l'analyse. */
  currentLevel: 'basse' | 'moyenne' | 'haute';
  /** Conseil de calendrier (quand vendre, faut-il attendre). */
  advice: string;
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
  seasonality?: Seasonality;
  /** Prix neuf de référence en France (0 si introuvable). */
  newPrice?: number;
  newPriceSource?: string;
  newPriceUrl?: string;
  demand: 'faible' | 'moyenne' | 'forte';
  saleSpeedDaysLow: number;
  saleSpeedDaysHigh: number;
  /** Délai de vente au prix « vente rapide » (jours). */
  quickSaleDaysLow?: number;
  quickSaleDaysHigh?: number;
  /** Délai de vente au « prix haut » (jours). */
  highPriceDaysLow?: number;
  highPriceDaysHigh?: number;
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
  /** Consommation cumulée de l'analyse (toutes étapes confondues). */
  usage?: Usage;
};

/** Mode « Acheter » : combien payer un objet d'occasion. */
export type BuyContext = 'brocante' | 'annonce';

export type BuyCheck = { point: string; why: string };

export type BuyResult = {
  objectName: string;
  brand: string;
  model: string;
  reference: string;
  category: string;
  condition: string;
  confidence: number;
  detectedText: string[];
  identificationWarnings: string[];
  /** Prix à partir duquel c'est une bonne affaire (≤). */
  goodDealPrice: number;
  /** Prix de marché habituel. */
  averagePrice: number;
  /** Prix au-delà duquel c'est trop cher (≥). */
  tooExpensivePrice: number;
  priceConfidence: number;
  /** Prix demandé lu sur la capture d'annonce (0 si absent). */
  askingPriceDetected: number;
  newPrice: number;
  newPriceSource: string;
  newPriceUrl: string;
  marketBasis: string;
  comparables: Comparable[];
  /** Points à contrôler avant d'acheter. */
  checks: BuyCheck[];
  /** Signaux d'alerte : contrefaçon, annonce suspecte, prix anormal… */
  redFlags: string[];
  context: BuyContext;
  sources: MarketSource[];
  mode: 'ai' | 'demo';
  provider?: ProviderId;
  usedModel?: string;
  usage?: Usage;
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

/**
 * Appel générique d'un fournisseur : l'appelant fournit le prompt et le schéma
 * JSON attendu. Les photos sont optionnelles (étape « marché » sans image).
 */
export type ProviderCall = {
  apiKey: string;
  model: string;
  webSearch: boolean;
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
  imagesDataUrl: string[];
  signal?: AbortSignal;
};

/** Réponse brute normalisée d'un fournisseur. */
export type ProviderRawResult = {
  /** Texte JSON renvoyé par le modèle. */
  text: string;
  /** Sources web citées, si le fournisseur en expose. */
  sources: MarketSource[];
  /** Jetons consommés et recherches web effectuées. */
  usage: Usage;
};

export type ProviderAdapter = {
  info: ProviderInfo;
  /** Lance l'analyse vision + recherche marché. */
  analyze(call: ProviderCall): Promise<ProviderRawResult>;
  /** Vérifie la clé et renvoie la liste des modèles disponibles. */
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
};
