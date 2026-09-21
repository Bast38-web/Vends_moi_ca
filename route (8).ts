import { configuredProviders } from '@/lib/keys';
import versionInfo from '@/public/version.json';

/** Sonde : version déployée et fournisseurs disposant d'une clé serveur. Aucune clé n'est exposée. */
export async function GET() {
  const configured = configuredProviders();
  return Response.json({
    ok: true,
    name: 'Vends-moi ça API',
    version: versionInfo.version,
    date: versionInfo.date,
    aiConfigured: configured.length > 0,
    configuredProviders: configured,
    defaultProvider: process.env.AI_PROVIDER || configured[0] || null,
  });
}
