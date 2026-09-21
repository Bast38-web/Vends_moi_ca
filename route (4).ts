import {
  analyzeObject,
  getAdapter,
  isProviderId,
  makeDemoResult,
  type AnalyzeInput,
  type ProviderId,
} from '@/shared/ai';
import { configuredProviders, resolveKey } from '@/lib/keys';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Body = AnalyzeInput & {
  provider?: string;
  model?: string;
  webSearch?: boolean;
  demo?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (body.demo) return Response.json(makeDemoResult());

    // Fournisseur : demandé par l'app, sinon AI_PROVIDER, sinon le premier
    // disposant d'une clé serveur, sinon OpenAI.
    const requested = isProviderId(body.provider) ? body.provider : null;
    const configured = isProviderId(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : null;
    const provider: ProviderId = requested ?? configured ?? configuredProviders()[0] ?? 'openai';

    const info = getAdapter(provider).info;
    const { key } = resolveKey(req, provider);
    if (!key) {
      return Response.json(
        { error: `Aucune clé ${info.label} : saisis-la dans Réglages, ou ajoute ${info.envKey} sur Vercel.` },
        { status: 401 },
      );
    }

    const model =
      (body.model || '').trim() ||
      (process.env[`${info.envKey.replace(/_API_KEY$/, '')}_MODEL`] || '').trim() ||
      info.defaultModel;

    const result = await analyzeObject(
      {
        imagesDataUrl: body.imagesDataUrl ?? [],
        notes: body.notes,
        knownReference: body.knownReference,
        locationHint: body.locationHint,
      },
      { provider, apiKey: key, model, webSearch: body.webSearch ?? true },
    );

    return Response.json(result);
  } catch (error: any) {
    const message = error?.message || 'Erreur serveur inattendue.';
    console.error('[analyze]', message);
    const status = /photo/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
