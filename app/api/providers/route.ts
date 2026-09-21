import { PROVIDERS } from '@/shared/ai';
import { configuredProviders } from '@/lib/keys';

/**
 * Catalogue des fournisseurs pour l'écran Réglages de la page HTML.
 * Source unique : shared/ai/providers — un nouveau fournisseur y apparaît seul.
 */
export async function GET() {
  const configured = configuredProviders();
  return Response.json({
    providers: PROVIDERS.map((info) => ({ ...info, serverKey: configured.includes(info.id) })),
    defaultProvider: process.env.AI_PROVIDER || configured[0] || 'openai',
  });
}
