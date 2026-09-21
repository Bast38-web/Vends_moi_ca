import { configuredProviders } from '@/lib/keys';

/** Sonde : indique quels fournisseurs disposent d'une clé serveur. Aucune clé n'est exposée. */
export async function GET() {
  const configured = configuredProviders();
  return Response.json({
    ok: true,
    name: 'Vends-moi ça API',
    version: '3.3.1',
    aiConfigured: configured.length > 0,
    configuredProviders: configured,
    defaultProvider: process.env.AI_PROVIDER || configured[0] || null,
  });
}
