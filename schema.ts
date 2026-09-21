import type { AnalyzeInput } from './types';

/**
 * Schéma JSON du résultat d'analyse.
 * Utilisé en mode « structured output » par les fournisseurs qui le supportent,
 * et injecté dans le prompt pour les autres.
 */
export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    objectName: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    reference: { type: 'string' },
    category: { type: 'string' },
    condition: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    priceConfidence: { type: 'number', minimum: 0, maximum: 1 },
    detectedText: { type: 'array', items: { type: 'string' } },
    visibleDetails: { type: 'array', items: { type: 'string' } },
    defects: { type: 'array', items: { type: 'string' } },
    identificationWarnings: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    quickSalePrice: { type: 'number', minimum: 0 },
    suggestedPrice: { type: 'number', minimum: 0 },
    negotiationFloor: { type: 'number', minimum: 0 },
    estimatedLow: { type: 'number', minimum: 0 },
    estimatedHigh: { type: 'number', minimum: 0 },
    demand: { type: 'string', enum: ['faible', 'moyenne', 'forte'] },
    saleSpeedDaysLow: { type: 'integer', minimum: 0 },
    saleSpeedDaysHigh: { type: 'integer', minimum: 0 },
    marketBasis: { type: 'string' },
    comparables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          price: { type: 'number', minimum: 0 },
          condition: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['label', 'price', 'condition', 'source'],
        additionalProperties: false,
      },
    },
    title: { type: 'string' },
    description: { type: 'string' },
    sellerTips: { type: 'array', items: { type: 'string' } },
    platformAdvice: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string' },
        },
        required: ['name', 'score', 'reason'],
        additionalProperties: false,
      },
    },
    shippingAdvice: { type: 'string' },
  },
  required: [
    'objectName', 'brand', 'model', 'reference', 'category', 'condition', 'confidence', 'priceConfidence',
    'detectedText', 'visibleDetails', 'defects', 'identificationWarnings', 'keywords', 'quickSalePrice',
    'suggestedPrice', 'negotiationFloor', 'estimatedLow', 'estimatedHigh', 'demand', 'saleSpeedDaysLow',
    'saleSpeedDaysHigh', 'marketBasis', 'comparables', 'title', 'description', 'sellerTips',
    'platformAdvice', 'shippingAdvice',
  ],
  additionalProperties: false,
} as const;

/** Consigne métier commune à tous les fournisseurs. */
export function buildPrompt(input: AnalyzeInput, options: { webSearch: boolean }): string {
  const marketRule = options.webSearch
    ? '- Utilise la recherche web pour trouver des annonces/comparables d’occasion récents, en priorité France puis Europe. Écarte le neuf, les pièces détachées non comparables et les annonces manifestement aberrantes.\n- Les comparables doivent résumer de vrais résultats de recherche observés. Si tu n’en trouves pas suffisamment, réduis priceConfidence et explique-le dans marketBasis.'
    : '- Tu n’as PAS accès à la recherche web : appuie-toi sur ta connaissance du marché de l’occasion, reste prudent, plafonne priceConfidence à 0.6 et indique clairement dans marketBasis que l’estimation ne repose pas sur des annonces vérifiées.\n- Les comparables doivent alors être présentés comme des ordres de grandeur, avec source « Estimation modèle ».';

  return `Tu es l’expert de l’application française de revente d’occasion « Vends-moi ça ».
Analyse plusieurs photos du MÊME objet et estime son marché d’occasion actuel.

Règles strictes :
- Identifie l’objet, la marque, le modèle et la référence uniquement si les éléments visuels ou les notes le permettent. Sinon laisse les champs incertains vides et ajoute un avertissement.
- Lis les textes/étiquettes visibles et mets uniquement les éléments réellement lisibles dans detectedText.
- Ne prétends jamais qu’un objet fonctionne si l’utilisateur ne l’a pas indiqué.
${marketRule}
- Tous les prix sont en EUR. negotiationFloor doit être inférieur ou égal à suggestedPrice. quickSalePrice doit viser une vente plus rapide.
- Donne une estimation prudente du délai de vente (saleSpeedDaysLow/High) selon demande, prix et catégorie.
- Rédige un titre court et une annonce française prête à publier, factuelle et sans promesse invérifiable.
- Recommande jusqu’à 4 plateformes de revente entre particuliers actives en France, avec score 0-100 et raison : Leboncoin, Vinted, eBay, Facebook Marketplace ; pour une revente immédiate, tu peux aussi proposer Back Market (rachat de high-tech) ou Momox (livres, CD, DVD, jeux vidéo).
- Ne recommande JAMAIS Rakuten (ex-PriceMinister) : sa marketplace française ferme le 30 septembre 2026.
- sellerTips : 2 à 5 actions concrètes pour améliorer la vente (photo manquante, info à préciser, test utile, etc.).
- shippingAdvice : conseil d’envoi/remise en main propre adapté au type d’objet, sans inventer de règles juridiques.

Notes utilisateur : ${input.notes?.trim() || 'Aucune'}
Référence saisie par l’utilisateur : ${input.knownReference?.trim() || 'Aucune'}
Zone de vente : ${input.locationHint?.trim() || 'France'}

La confidence mesure seulement la certitude d’identification. priceConfidence mesure la fiabilité de l’estimation de prix.`;
}

/** Consigne de format ajoutée pour les fournisseurs sans schéma strict natif. */
export function jsonInstruction(): string {
  return `

FORMAT DE RÉPONSE OBLIGATOIRE
Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans bloc de code markdown.
Il doit respecter exactement ce schéma JSON :
${JSON.stringify(ANALYSIS_SCHEMA)}`;
}
