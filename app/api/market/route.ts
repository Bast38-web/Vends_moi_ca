import { studyMarket, type AnalyzeInput, type Identity } from '@/shared/ai';
import { errorResponse, resolveStep, type StepBody } from '@/lib/request';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Étape 2 : étude de marché à partir de la fiche d'identification (sans photo). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Omit<AnalyzeInput, 'imagesDataUrl'> & StepBody & { identity?: Partial<Identity> };
    if (!body.identity || typeof body.identity !== 'object') {
      return Response.json({ error: 'Fiche d’identification manquante.' }, { status: 400 });
    }
    const { provider, info, key, model } = resolveStep(req, body);
    if (!key) {
      return Response.json({ error: `Aucune clé ${info.label} : saisis-la dans Réglages, ou ajoute ${info.envKey} sur Vercel.` }, { status: 401 });
    }
    const result = await studyMarket(
      { imagesDataUrl: [], notes: body.notes, knownReference: body.knownReference, locationHint: body.locationHint },
      body.identity,
      { provider, apiKey: key, model, webSearch: body.webSearch ?? true },
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
