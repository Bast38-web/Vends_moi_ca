import { makeBuyDemoResult, studyPurchase, type AnalyzeInput, type BuyContext, type Identity } from '@/shared/ai';
import { errorResponse, resolveStep, type StepBody } from '@/lib/request';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Mode « Acheter » : à partir de la fiche d'identification (étape 1 commune
 * avec la vente), estime le bon prix d'achat et les points à vérifier.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Omit<AnalyzeInput, 'imagesDataUrl'> & StepBody & {
      identity?: Partial<Identity>;
      context?: string;
      askingPrice?: number;
      demo?: boolean;
    };
    const context: BuyContext = body.context === 'annonce' ? 'annonce' : 'brocante';
    if (body.demo) return Response.json(makeBuyDemoResult(context));
    if (!body.identity || typeof body.identity !== 'object') {
      return Response.json({ error: 'Fiche d’identification manquante.' }, { status: 400 });
    }
    const { provider, info, key, model } = resolveStep(req, body);
    if (!key) {
      return Response.json({ error: `Aucune clé ${info.label} : saisis-la dans Réglages, ou ajoute ${info.envKey} sur Vercel.` }, { status: 401 });
    }
    const askingPrice = Number(body.askingPrice) > 0 ? Math.round(Number(body.askingPrice)) : undefined;
    const result = await studyPurchase(
      { imagesDataUrl: [], notes: body.notes, locationHint: body.locationHint },
      body.identity,
      { provider, apiKey: key, model, webSearch: body.webSearch ?? true, context, askingPrice },
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
