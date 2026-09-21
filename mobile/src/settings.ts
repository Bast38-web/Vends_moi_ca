import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getAdapter, PROVIDER_IDS, type ProviderId } from '../../shared/ai';

/**
 * Réglages de l'application.
 *
 * - Les préférences (fournisseur, modèle, URL backend) vont dans AsyncStorage.
 * - Les clés API vont dans le coffre sécurisé du téléphone (expo-secure-store),
 *   avec repli sur AsyncStorage si le coffre n'est pas disponible.
 * Aucune clé n'est jamais envoyée ailleurs qu'au fournisseur choisi.
 */

export type AiMode =
  | 'direct'   // le téléphone appelle directement l'API du fournisseur
  | 'backend'  // l'analyse passe par le backend Next.js (clé côté serveur)
  | 'demo';    // résultat de démonstration, aucune clé nécessaire

export type AppSettings = {
  mode: AiMode;
  provider: ProviderId;
  /** Modèle choisi par fournisseur. Vide = modèle par défaut du fournisseur. */
  models: Partial<Record<ProviderId, string>>;
  /** Recherche web pendant l'analyse, si le fournisseur la supporte. */
  webSearch: boolean;
  /** URL du backend Next.js, utilisée en mode « backend ». */
  backendUrl: string;
  /** Zone de vente pré-remplie dans le formulaire. */
  defaultLocation: string;
};

const SETTINGS_KEY = 'vends-moi-ca-v3-settings';
const KEY_PREFIX = 'vmc_api_key_';

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'demo',
  provider: 'openai',
  models: {},
  webSearch: true,
  backendUrl: (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, ''),
  defaultLocation: 'France',
};

/* ------------------------------------------------------------------ */
/* Préférences                                                         */
/* ------------------------------------------------------------------ */

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      provider: PROVIDER_IDS.includes(parsed.provider as ProviderId)
        ? (parsed.provider as ProviderId)
        : DEFAULT_SETTINGS.provider,
      models: parsed.models ?? {},
      backendUrl: (parsed.backendUrl ?? DEFAULT_SETTINGS.backendUrl).replace(/\/$/, ''),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ------------------------------------------------------------------ */
/* Clés API                                                            */
/* ------------------------------------------------------------------ */

async function secureAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function loadApiKey(provider: ProviderId): Promise<string> {
  const slot = `${KEY_PREFIX}${provider}`;
  try {
    if (await secureAvailable()) {
      return (await SecureStore.getItemAsync(slot)) ?? '';
    }
  } catch { /* on tente le repli ci-dessous */ }
  try {
    return (await AsyncStorage.getItem(slot)) ?? '';
  } catch {
    return '';
  }
}

export async function saveApiKey(provider: ProviderId, key: string): Promise<void> {
  const slot = `${KEY_PREFIX}${provider}`;
  const value = key.trim();
  if (await secureAvailable()) {
    if (value) await SecureStore.setItemAsync(slot, value);
    else await SecureStore.deleteItemAsync(slot).catch(() => undefined);
    await AsyncStorage.removeItem(slot).catch(() => undefined);
    return;
  }
  if (value) await AsyncStorage.setItem(slot, value);
  else await AsyncStorage.removeItem(slot);
}

/** Charge toutes les clés enregistrées, pour l'écran Réglages. */
export async function loadAllApiKeys(): Promise<Partial<Record<ProviderId, string>>> {
  const entries = await Promise.all(
    PROVIDER_IDS.map(async (id) => [id, await loadApiKey(id)] as const),
  );
  return Object.fromEntries(entries.filter(([, key]) => key)) as Partial<Record<ProviderId, string>>;
}

/* ------------------------------------------------------------------ */
/* Aides                                                               */
/* ------------------------------------------------------------------ */

/** Modèle réellement utilisé pour le fournisseur courant. */
export function resolvedModel(settings: AppSettings, provider = settings.provider): string {
  return (settings.models[provider] || '').trim() || getAdapter(provider).info.defaultModel;
}

/** Masque une clé pour l'affichage : sk-...dK4a */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
