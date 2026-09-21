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
export { analyzeObject, normalizeResult, MAX_IMAGES, MAX_IMAGE_CHARS } from './analyze';
export type { AnalyzeOptions } from './analyze';
export { ANALYSIS_SCHEMA, buildPrompt, jsonInstruction } from './schema';
export { makeDemoResult } from './demo';
export { collectSources, extractJson, splitDataUrl, apiErrorMessage } from './utils';
