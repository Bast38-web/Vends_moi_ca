/**
 * Socle IA partagé « Vends-moi ça ».
 *
 * Tout passe par ici : l'application mobile (appel direct depuis le téléphone
 * avec la clé saisie dans Réglages) comme le backend Next.js (clé côté serveur).
 * Un seul endroit à modifier pour ajouter un fournisseur, changer le prompt ou
 * faire évoluer le schéma de résultat.
 */
export * from './types';
export * from './providers';
export { analyzeObject, identifyObject, studyMarket, studyPurchase, normalizeBuy, normalizeResult, normalizeIdentity, addUsage, MAX_IMAGES, MAX_IMAGE_CHARS } from './analyze';
export type { AnalyzeOptions, Identity } from './analyze';
export { ANALYSIS_SCHEMA, IDENTIFY_SCHEMA, MARKET_SCHEMA, buildPrompt, buildIdentifyPrompt, buildMarketPrompt, jsonInstruction } from './schema';
export { makeDemoResult, makeBuyDemoResult } from './demo';
export { collectSources, extractJson, splitDataUrl, apiErrorMessage } from './utils';
