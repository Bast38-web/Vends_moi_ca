import type { ProviderAdapter, ProviderId, ProviderInfo } from '../types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { mistralAdapter } from './mistral';
import { openaiAdapter } from './openai';

/**
 * Catalogue des fournisseurs.
 * Pour en ajouter un : créer `shared/ai/providers/<nom>.ts` sur le modèle des
 * autres, l'ajouter ici, et ajouter son identifiant dans `ProviderId`
 * (shared/ai/types.ts). Rien d'autre à modifier : l'écran Réglages, le backend
 * et l'analyse se branchent automatiquement.
 */
export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  mistral: mistralAdapter,
};

export const PROVIDER_IDS = Object.keys(ADAPTERS) as ProviderId[];

export const PROVIDERS: ProviderInfo[] = PROVIDER_IDS.map((id) => ADAPTERS[id].info);

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`Fournisseur inconnu : ${id}`);
  return adapter;
}

export function getProviderInfo(id: ProviderId): ProviderInfo {
  return getAdapter(id).info;
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);
}
