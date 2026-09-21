import { getAdapter, PROVIDERS, type ProviderId } from '@/shared/ai';

/** En-tête HTTP par lequel l'application transmet la clé saisie dans Réglages. */
export const CLIENT_KEY_HEADER = 'x-ai-key';

/** Clé du fournisseur lue dans les variables d'environnement Vercel. */
export function serverKey(provider: ProviderId): string {
  return (process.env[getAdapter(provider).info.envKey] || '').trim();
}

/** Clé transmise par l'application (page HTML ou app mobile). */
export function clientKey(req: Request): string {
  return (req.headers.get(CLIENT_KEY_HEADER) || '').trim();
}

/**
 * Clé à utiliser : celle saisie par l'utilisateur en priorité,
 * sinon celle du serveur.
 */
export function resolveKey(req: Request, provider: ProviderId): { key: string; origin: 'client' | 'server' | 'none' } {
  const fromClient = clientKey(req);
  if (fromClient) return { key: fromClient, origin: 'client' };
  const fromServer = serverKey(provider);
  if (fromServer) return { key: fromServer, origin: 'server' };
  return { key: '', origin: 'none' };
}

/** Fournisseurs disposant d'une clé côté serveur. */
export function configuredProviders(): ProviderId[] {
  return PROVIDERS.filter((info) => serverKey(info.id)).map((info) => info.id);
}
