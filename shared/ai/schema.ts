import type { AnalyzeInput } from './types';

/**
 * Schémas JSON et consignes de l'analyse.
 *
 * L'analyse se fait en deux étapes, chacune courte (limite de 60 s sur Vercel) :
 *   1. IDENTIFICATION — photos → objet, marque, modèle, état (sans recherche web) ;
 *   2. MARCHÉ — fiche d'identification → prix, délais, comparables, annonce
 *      (avec recherche web, sans renvoyer les photos).
 * ANALYSIS_SCHEMA regroupe les deux pour l'analyse en un seul appel (app mobile).
 */

const str = { type: 'string' } as const;
const strList = { type: 'array', items: { type: 'string' } } as const;
const int0 = { type: 'integer', minimum: 0 } as const;
const num0 = { type: 'number', minimum: 0 } as const;

const IDENTITY_PROPS = {
  objectName: str,
  brand: str,
  model: str,
  reference: str,
  category: str,
  condition: str,
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  detectedText: strList,
  visibleDetails: strList,
  defects: strList,
  identificationWarnings: strList,
  keywords: strList,
} as const;

const MARKET_PROPS = {
  priceConfidence: { type: 'number', minimum: 0, maximum: 1 },
  quickSalePrice: num0,
  suggestedPrice: num0,
  negotiationFloor: num0,
  estimatedLow: num0,
  estimatedHigh: num0,
  newPrice: num0,
  newPriceSource: str,
  newPriceUrl: str,
  seasonality: {
    type: 'object',
    properties: {
      monthlyDemand: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 100 } },
      currentLevel: { type: 'string', enum: ['basse', 'moyenne', 'haute'] },
      advice: str,
    },
    required: ['monthlyDemand', 'currentLevel', 'advice'],
    additionalProperties: false,
  },
  demand: { type: 'string', enum: ['faible', 'moyenne', 'forte'] },
  saleSpeedDaysLow: int0,
  saleSpeedDaysHigh: int0,
  quickSaleDaysLow: int0,
  quickSaleDaysHigh: int0,
  highPriceDaysLow: int0,
  highPriceDaysHigh: int0,
  marketBasis: str,
  comparables: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: str,
        price: num0,
        condition: str,
        source: str,
        url: str,
        status: { type: 'string', enum: ['vendu', 'en vente', 'estimation'] },
      },
      required: ['label', 'price', 'condition', 'source', 'url', 'status'],
      additionalProperties: false,
    },
  },
  title: str,
  description: str,
  sellerTips: strList,
  platformAdvice: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: str,
        score: { type: 'integer', minimum: 0, maximum: 100 },
        reason: str,
        category: str,
        condition: str,
      },
      required: ['name', 'score', 'reason', 'category', 'condition'],
      additionalProperties: false,
    },
  },
  shippingAdvice: str,
} as const;

const objectSchema = (props: Record<string, unknown>): Record<string, unknown> => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
});

const COMPARABLE_ITEM = MARKET_PROPS.comparables;

const BUY_PROPS = {
  goodDealPrice: num0,
  averagePrice: num0,
  tooExpensivePrice: num0,
  priceConfidence: { type: 'number', minimum: 0, maximum: 1 },
  askingPriceDetected: num0,
  newPrice: num0,
  newPriceSource: str,
  newPriceUrl: str,
  marketBasis: str,
  comparables: COMPARABLE_ITEM,
  checks: {
    type: 'array',
    items: {
      type: 'object',
      properties: { point: str, why: str },
      required: ['point', 'why'],
      additionalProperties: false,
    },
  },
  redFlags: strList,
} as const;

export const BUY_SCHEMA = objectSchema(BUY_PROPS);
export const IDENTIFY_SCHEMA = objectSchema(IDENTITY_PROPS);
export const MARKET_SCHEMA = objectSchema(MARKET_PROPS);
export const ANALYSIS_SCHEMA = objectSchema({ ...IDENTITY_PROPS, ...MARKET_PROPS });

/** Champs produits par l'étape d'identification. */
export const IDENTITY_FIELDS = Object.keys(IDENTITY_PROPS);

/* ------------------------------------------------------------------ */
/* Consignes                                                           */
/* ------------------------------------------------------------------ */

const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const userContext = (input: AnalyzeInput) => `Notes utilisateur : ${input.notes?.trim() || 'Aucune'}
Référence saisie par l’utilisateur : ${input.knownReference?.trim() || 'Aucune'}
Zone de vente : ${input.locationHint?.trim() || 'France'}
Date du jour : ${today()}`;

const IDENTITY_RULES = `- Identifie l’objet, la marque, le modèle et la référence uniquement si les éléments visuels ou les notes le permettent. Sinon laisse les champs incertains vides et ajoute un avertissement.
- Lis les textes/étiquettes visibles et mets uniquement les éléments réellement lisibles dans detectedText.
- Ne prétends jamais qu’un objet fonctionne si l’utilisateur ne l’a pas indiqué.
- confidence mesure seulement la certitude d’identification.
- keywords : 3 à 8 mots-clés utiles pour rechercher cet objet en occasion.`;

function marketRules(webSearch: boolean): string {
  const search = webSearch
    ? `- Utilise la recherche web pour trouver des comparables d’occasion récents, en priorité France puis Europe. Écarte le neuf, les pièces détachées non comparables et les annonces aberrantes.
- PRIVILÉGIE LES PRIX DE VENTE RÉELLEMENT CONCLUS : les annonces encore en ligne surestiment le marché (les objets trop chers restent affichés). Cherche en priorité des ventes terminées (par exemple les « objets vendus » d’eBay) ; à défaut, applique une décote réaliste aux prix affichés et explique-le dans marketBasis.
- comparables : pour chacun, status = « vendu » si la transaction est conclue, « en vente » si l’annonce est active. url = l’adresse exacte de la page consultée, recopiée telle quelle depuis les résultats de recherche ; n’invente JAMAIS d’URL (chaîne vide sinon). Si tu n’en trouves pas suffisamment, réduis priceConfidence et dis-le dans marketBasis.`
    : `- Tu n’as PAS accès à la recherche web : appuie-toi sur ta connaissance du marché de l’occasion, reste prudent, plafonne priceConfidence à 0.6 et indique clairement dans marketBasis que l’estimation ne repose pas sur des annonces vérifiées.
- comparables : ordres de grandeur uniquement, avec status « estimation », source « Estimation modèle » et url vide.`;

  return `${search}
- Tous les prix sont en EUR. negotiationFloor ≤ suggestedPrice. quickSalePrice vise une vente plus rapide. estimatedHigh est le prix haut réaliste.
- newPrice = prix neuf actuel en France pour ce modèle exact (ou, s’il n’est plus commercialisé, son dernier prix neuf connu ou celui de son remplaçant direct, à préciser dans newPriceSource). newPriceSource = enseigne ou site ; newPriceUrl = adresse exacte consultée, jamais inventée (chaîne vide sinon). newPrice = 0 si aucun prix neuf fiable.
- seasonality : saisonnalité de la demande d’occasion en France pour ce type d’objet. monthlyDemand = exactement 12 entiers de 0 à 100, de janvier à décembre (courbe plate autour de 50 si l’objet n’est pas saisonnier). currentLevel = niveau du mois en cours. advice = une ou deux phrases : meilleure période, intérêt ou non d’attendre compte tenu de la date du jour. Tiens compte de la saison actuelle dans les prix et les délais.
- Délais de vente prudents POUR CHACUN DES TROIS PRIX : quickSaleDaysLow/High au prix quickSalePrice, saleSpeedDaysLow/High au prix suggestedPrice, highPriceDaysLow/High au prix estimatedHigh. Plus le prix est élevé, plus le délai est long.
- Rédige un titre court et une annonce française prête à publier, factuelle et sans promesse invérifiable.
- Recommande jusqu’à 4 plateformes de revente entre particuliers actives en France, avec score 0-100 et raison : Leboncoin, Vinted, eBay, Facebook Marketplace ; pour une revente immédiate, tu peux aussi proposer Back Market (rachat de high-tech) ou Momox (livres, CD, DVD, jeux vidéo). Pour chacune : category = catégorie la plus proche dans l’arborescence de la plateforme ; condition = état tel que libellé dans les choix de la plateforme.
- Ne recommande JAMAIS Rakuten (ex-PriceMinister) : sa marketplace française ferme le 30 septembre 2026.
- sellerTips : 2 à 5 actions concrètes pour améliorer la vente. shippingAdvice : conseil d’envoi ou de remise en main propre, sans inventer de règles juridiques.
- priceConfidence mesure la fiabilité de l’estimation de prix.`;
}

/** Étape 1 : identification à partir des photos. */
export function buildIdentifyPrompt(input: AnalyzeInput): string {
  return `Tu es l’expert de l’application française de revente d’occasion « Vends-moi ça ».
Analyse les photos du MÊME objet et identifie-le précisément. Ne donne AUCUN prix à cette étape.

Règles strictes :
${IDENTITY_RULES}

${userContext(input)}`;
}

/** Étape 2 : étude de marché à partir de la fiche d'identification (sans photo). */
export function buildMarketPrompt(input: AnalyzeInput, identity: Record<string, unknown>, options: { webSearch: boolean }): string {
  return `Tu es l’expert de l’application française de revente d’occasion « Vends-moi ça ».
Un objet a été identifié à partir de photos. Voici sa fiche d’identification (JSON) :
${JSON.stringify(identity)}

Estime son marché d’occasion actuel et prépare l’annonce.

Règles strictes :
${marketRules(options.webSearch)}
- Ne prétends jamais qu’un objet fonctionne si l’utilisateur ne l’a pas indiqué ; appuie-toi sur l’état et les défauts de la fiche.

${userContext(input)}`;
}

/** Mode « Acheter » : combien payer cet objet d'occasion. */
export function buildBuyPrompt(
  input: AnalyzeInput,
  identity: Record<string, unknown>,
  options: { webSearch: boolean; context: 'brocante' | 'annonce'; askingPrice?: number },
): string {
  const where = options.context === 'brocante'
    ? `L’acheteur est dans une BROCANTE / UN VIDE-GRENIER : paiement en espèces, négociation d’usage, pas de garantie ni de retour possible, objet testable sur place seulement s’il y a une prise ou des piles. Les prix de brocante sont en général nettement inférieurs aux prix des plateformes en ligne : tiens-en compte.`
    : `L’acheteur regarde une ANNONCE EN LIGNE (souvent une capture d’écran de Leboncoin, Vinted, eBay ou Facebook Marketplace). Lis dans la fiche le prix demandé et les éléments de l’annonce s’ils sont visibles (askingPriceDetected = prix lu, 0 sinon). Les frais de port ou de protection acheteur éventuels s’ajoutent au prix.`;
  const search = options.webSearch
    ? `- Utilise la recherche web pour établir le prix de marché d’occasion actuel en France. PRIVILÉGIE LES VENTES CONCLUES (par exemple les « objets vendus » d’eBay) ; les annonces encore en ligne surestiment le marché.
- comparables : status « vendu » ou « en vente », url = adresse exacte consultée, jamais inventée (chaîne vide sinon).`
    : `- Sans recherche web : appuie-toi sur ta connaissance du marché, plafonne priceConfidence à 0.6, comparables avec status « estimation » et url vide.`;
  return `Tu es l’expert achat de l’application française « Vends-moi ça ». Un particulier envisage d’ACHETER cet objet d’occasion et veut savoir combien le payer.
Voici la fiche d’identification établie à partir de ses photos (JSON) :
${JSON.stringify(identity)}

${where}
${options.askingPrice ? `Prix demandé indiqué par l’acheteur : ${options.askingPrice} €.` : ''}

Règles strictes :
${search}
- Tous les prix en EUR, pour cet objet dans l’état décrit : goodDealPrice (en dessous ou égal : bonne affaire) < averagePrice (prix habituel pour ce contexte) < tooExpensivePrice (au-dessus ou égal : trop cher).
- newPrice = prix neuf actuel en France (ou dernier prix connu / remplaçant direct, précisé dans newPriceSource) ; newPriceUrl jamais inventée ; 0 si inconnu.
- checks : 3 à 6 points concrets à vérifier AVANT d’acheter ce modèle précis (défauts fréquents connus, pièces d’usure, accessoires indispensables souvent manquants, tests simples à faire sur place, compatibilité, authenticité), chacun avec la raison (why).
- redFlags : signaux d’alerte réellement présents ou typiques à surveiller (risque de contrefaçon pour cette marque, prix anormalement bas, annonce suspecte : paiement hors plateforme, envoi uniquement, compte récent…). Liste vide si rien de particulier.
- marketBasis : 2 à 3 phrases expliquant comment les prix ont été établis.
- Ne prétends jamais que l’objet fonctionne : l’acheteur doit le vérifier.

${userContext(input)}`;
}

/** Analyse complète en un seul appel (application mobile Expo). */
export function buildPrompt(input: AnalyzeInput, options: { webSearch: boolean }): string {
  return `Tu es l’expert de l’application française de revente d’occasion « Vends-moi ça ».
Analyse plusieurs photos du MÊME objet et estime son marché d’occasion actuel.

Règles strictes :
${IDENTITY_RULES}
${marketRules(options.webSearch)}

${userContext(input)}`;
}

/** Consigne de format pour les fournisseurs sans schéma strict natif. */
export function jsonInstruction(schema: Record<string, unknown> = ANALYSIS_SCHEMA): string {
  return `

FORMAT DE RÉPONSE OBLIGATOIRE
Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans bloc de code markdown.
Il doit respecter exactement ce schéma JSON :
${JSON.stringify(schema)}`;
}
