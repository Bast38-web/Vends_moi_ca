import { configuredProviders, resolveKey } from '@/lib/keys';
import { getAdapter, isProviderId, type ProviderId } from '@/shared/ai';

export type StepBody = {
  provider?: string;
  model?: string;
  webSearch?: boolean;
};

/** Résout fournisseur, clé et modèle d'une requête (clé saisie ou clé Vercel). */
export function resolveStep(req: Request, body: StepBody) {
  const requested = isProviderId(body.provider) ? body.provider : null;
  const configured = isProviderId(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : null;
  const provider: ProviderId = requested ?? configured ?? configuredProviders()[0] ?? 'openai';
  const info = getAdapter(provider).info;
  const { key } = resolveKey(req, provider);
  const model =
    (body.model || '').trim() ||
    (process.env[`${info.envKey.replace(/_API_KEY$/, '')}_MODEL`] || '').trim() ||
    info.defaultModel;
  return { provider, info, key, model };
}

export function errorResponse(error: any) {
  const message = error?.message || 'Erreur serveur inattendue.';
  console.error('[api]', message);
  const status = /photo/i.test(message) ? 400 : 502;
  return Response.json({ error: message }, { status });
}
