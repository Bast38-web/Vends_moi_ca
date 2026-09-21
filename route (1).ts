import { getAdapter, isProviderId } from '@/shared/ai';
import { resolveKey } from '@/lib/keys';

export const runtime = 'nodejs';

/**
 * Vérifie une clé et renvoie la liste des modèles du fournisseur.
 * Passe par le serveur pour éviter les blocages CORS des navigateurs.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { provider?: string };
    if (!isProviderId(body.provider)) {
      return Response.json({ error: 'Fournisseur inconnu.' }, { status: 400 });
    }
    const { key, origin } = resolveKey(req, body.provider);
    if (!key) return Response.json({ error: 'Saisis d’abord une clé API.' }, { status: 401 });

    const models = await getAdapter(body.provider).listModels(key);
    return Response.json({ ok: true, origin, models });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Vérification impossible.' }, { status: 502 });
  }
}
