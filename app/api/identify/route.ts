import { identifyObject, type AnalyzeInput } from '@/shared/ai';
import { errorResponse, resolveStep, type StepBody } from '@/lib/request';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Étape 1 : identification de l'objet à partir des photos (rapide, sans recherche web). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeInput & StepBody;
    const { provider, info, key, model } = resolveStep(req, body);
    if (!key) {
      return Response.json({ error: `Aucune clé ${info.label} : saisis-la dans Réglages, ou ajoute ${info.envKey} sur Vercel.` }, { status: 401 });
    }
    const identity = await identifyObject(
      { imagesDataUrl: body.imagesDataUrl ?? [], notes: body.notes, knownReference: body.knownReference, locationHint: body.locationHint },
      { provider, apiKey: key, model },
    );
    return Response.json(identity);
  } catch (error) {
    return errorResponse(error);
  }
}
