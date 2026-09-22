# Vends-moi ça — V3.2

Deux interfaces, un seul socle IA :

- **Version web** (`public/index.html`) — s'ouvre directement à l'adresse Vercel du projet, sur smartphone comme sur PC. Aucune installation.
- **Application Expo** (`mobile/`) — pour une future application native / APK.

La V3.1 ne change pas les fonctionnalités de vente : elle refond la **trame technique** pour que l’API d’IA soit configurable depuis l’application, comme dans les autres applicatifs ELLIPSE.

---

## Ce qui change par rapport à la V3

| | V3 | V3.1 |
|---|---|---|
| Fournisseur d’IA | OpenAI en dur dans le backend | OpenAI, Anthropic, Gemini, Mistral — au choix |
| Clé API | variable d’environnement du serveur | saisie dans l’app, dans le coffre sécurisé du téléphone |
| Backend Next.js | obligatoire pour l’analyse réelle | optionnel (mode « Backend » au choix) |
| Modèle | `OPENAI_MODEL` | choisi dans Réglages, liste réelle des modèles de la clé |
| Recherche web | toujours active | activable, selon les capacités du fournisseur |
| Code IA | dupliqué app / serveur | mutualisé dans `shared/ai/` |

Trois modes d’analyse, sélectionnables dans l’onglet **Réglages** :

1. **Clé directe** — le téléphone appelle l’API du fournisseur avec la clé saisie. Aucun serveur à déployer.
2. **Backend** — l’analyse passe par le backend Next.js, qui détient la clé côté serveur (fonctionnement V3).
3. **Démo** — résultat simulé, sans clé ni réseau.

---

## Version web (V3.2)

L'adresse Vercel du projet affiche directement l'application : `https://<projet>.vercel.app/`.

- Fichier unique `public/index.html` (HTML/CSS/JS sans framework), servi à la racine par la réécriture de `next.config.mjs`.
- Parité avec l'app Expo : Accueil / tableau de bord, Vendre (4 photos, analyse, annonce modifiable), Mes ventes (brouillon / en ligne / vendu), Réglages.
- **Clé API** : saisie dans Réglages, conservée dans le navigateur, envoyée au backend dans l'en-tête `x-ai-key`, qui la relaie au fournisseur sans l'enregistrer. Si le champ est vide, le backend utilise la clé des variables Vercel.
- Passer par le backend évite les blocages CORS des navigateurs, pour les 4 fournisseurs.
- Photos redimensionnées sur l'appareil (1 280 px, JPEG) : la requête reste sous la limite de 4,5 Mo de Vercel.
- Ventes stockées dans le navigateur (`localStorage`), avec export / import JSON dans Réglages.
- Sur smartphone : menu du navigateur → « Ajouter à l'écran d'accueil » pour l'ouvrir comme une app.

Routes API :

| Route | Rôle |
|---|---|
| `POST /api/identify` | étape 1 : identification à partir des photos (sans recherche web) |
| `POST /api/market` | étape 2 : étude de marché à partir de la fiche d'identification (recherche web, sans photo) |
| `POST /api/buy` | mode « Acheter » : bon prix d'achat et points à vérifier, à partir de la fiche d'identification |
| `POST /api/analyze` | analyse complète en un appel (app mobile, mode démo) |
| `POST /api/models` | vérifie une clé et liste les modèles |
| `GET /api/providers` | catalogue des fournisseurs (alimente Réglages) |
| `GET /api/health` | état du serveur et clés configurées |

---

## Structure

```text
vends-moi-ca-v3/
├─ shared/ai/                 # ★ socle IA commun app + backend
│  ├─ types.ts                #   types métier + types fournisseurs
│  ├─ schema.ts               #   prompt et schéma JSON du résultat
│  ├─ analyze.ts              #   point d'entrée + normalisation du résultat
│  ├─ utils.ts                #   data URL, extraction JSON, sources, erreurs
│  ├─ demo.ts                 #   résultat de démonstration
│  └─ providers/              #   un fichier par API
│     ├─ index.ts             #   catalogue des fournisseurs
│     ├─ openai.ts
│     ├─ anthropic.ts
│     ├─ gemini.ts
│     └─ mistral.ts
├─ public/index.html          # ★ application web mono-fichier (servie sur « / »)
├─ next.config.mjs            #   réécriture « / » → index.html
├─ app/api/                   # API Next.js → Vercel
│  ├─ analyze/route.ts        #   analyse multi-fournisseurs
│  ├─ models/route.ts         #   vérification de clé + liste des modèles
│  ├─ providers/route.ts      #   catalogue des fournisseurs
│  └─ health/route.ts         #   état du serveur
├─ lib/keys.ts                # clé saisie (en-tête x-ai-key) ou clé Vercel
├─ lib/                       # + réexports de compatibilité vers shared/
├─ mobile/                    # application Expo
│  ├─ App.tsx                 #   4 onglets : Accueil / Vendre / Mes ventes / Réglages
│  ├─ metro.config.js         #   ★ rend `shared/` visible par Metro
│  └─ src/
│     ├─ settings.ts          #   réglages + stockage sécurisé des clés
│     ├─ analyze.ts           #   aiguillage direct / backend / démo
│     ├─ SettingsScreen.tsx   #   écran Réglages
│     ├─ storage.ts           #   ventes enregistrées
│     └─ types.ts             #   réexport de shared/ai/types
└─ .env.example               # variables du backend uniquement
```

Le point important : **`shared/ai/` est la seule source de vérité**. Prompt, schéma de résultat et appels d’API n’existent qu’à un seul endroit, utilisé aussi bien par le téléphone que par le serveur.

---

## Ajouter une API — 3 étapes

Tout se passe dans `shared/ai/`. Exemple pour un fournisseur fictif « Acme ».

**1. Créer `shared/ai/providers/acme.ts`** en copiant `mistral.ts` (le plus simple) :

```ts
import { buildPrompt, jsonInstruction } from '../schema';
import type { ProviderAdapter } from '../types';
import { apiErrorMessage, collectSources } from '../utils';

const LABEL = 'Acme';

export const acmeAdapter: ProviderAdapter = {
  info: {
    id: 'acme',
    label: LABEL,
    defaultModel: 'acme-vision-1',
    suggestedModels: ['acme-vision-1'],
    supportsWebSearch: false,        // true si l'API sait chercher sur le web
    keyUrl: 'https://console.acme.ai/keys',
    envKey: 'ACME_API_KEY',          // variable serveur correspondante
    hint: 'Clé de la console Acme.',
  },
  async analyze(call) { /* fetch → { text, sources } */ },
  async listModels(apiKey, signal) { /* GET /models → string[] */ },
};
```

Deux contrats seulement :

- `analyze` renvoie `{ text, sources }`, où `text` est le JSON produit par le modèle. Pas besoin qu’il soit propre : `extractJson` tolère les blocs markdown et le texte autour.
- `listModels` valide la clé et alimente le sélecteur de modèles de l’écran Réglages.

**2. Déclarer l’identifiant** dans `shared/ai/types.ts` :

```ts
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'acme';
```

**3. L’enregistrer** dans `shared/ai/providers/index.ts` :

```ts
import { acmeAdapter } from './acme';

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  mistral: mistralAdapter,
  acme: acmeAdapter,
};
```

C’est tout. Les écrans Réglages (web et mobile), la vérification de clé, le backend et l’analyse prennent le nouveau fournisseur en compte automatiquement. Aucune modification de `App.tsx` ni de `index.html` : la page web lit le catalogue via `/api/providers`.

### Points d’attention par API

| Fournisseur | Recherche web | Format JSON | Remarque |
|---|---|---|---|
| OpenAI | oui (`web_search`) | schéma strict natif | comportement identique à la V3 |
| Anthropic | oui (`web_search_20250305`) | consigne dans le prompt | en-tête `anthropic-dangerous-direct-browser-access` requis depuis un client |
| Gemini | oui (`google_search`) | consigne dans le prompt | recherche et mode JSON strict incompatibles : le prompt prend le relais |
| Mistral | non | `response_format: json_object` | estimation sans annonces vérifiées, `priceConfidence` plafonnée |

Le prompt s’adapte seul : quand la recherche web est indisponible, il demande explicitement au modèle de rester prudent et de le signaler dans `marketBasis`.

---

## Installation

### 1. Application mobile

```powershell
cd mobile
npm install
npx expo start
```

`npm install` est **obligatoire après cette mise à jour** : la dépendance `expo-secure-store` a été ajoutée pour le stockage des clés.

Installe **Expo Go** sur le téléphone et scanne le QR code.

### 2. Configuration dans l’app

Onglet **Réglages** :

1. Mode : **Clé directe**
2. Fournisseur : OpenAI, Anthropic, Gemini ou Mistral
3. Coller la clé API → **Vérifier la clé** (affiche le nombre de modèles disponibles)
4. Modèle : laisser vide pour la valeur par défaut, ou choisir dans la liste complète
5. Recherche web : activée si le fournisseur la propose

Aucun fichier `.env` n’est nécessaire dans ce mode.

### 3. Backend Next.js — optionnel

Utile si tu préfères que la clé ne quitte jamais le serveur, ou pour mutualiser une clé entre plusieurs téléphones.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Dans `.env.local`, une seule clé suffit :

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Sur Vercel : mêmes variables dans **Project → Settings → Environment Variables**.

Puis dans l’app : Réglages → mode **Backend** → URL du backend (en local, l’IPv4 du PC donnée par `ipconfig`, pas `localhost`) → **Tester le backend**, qui affiche les fournisseurs réellement configurés côté serveur.

---

## Sécurité des clés

- Mode **Clé directe** : la clé est écrite dans le coffre sécurisé du système (Keychain iOS / Keystore Android) via `expo-secure-store`, avec repli sur AsyncStorage si le coffre est indisponible. Elle n’est transmise qu’au fournisseur choisi, au moment de l’analyse.
- Mode **Backend** : aucune clé sur le téléphone.
- Les photos restent sur l’appareil ; elles ne sont envoyées qu’au fournisseur d’IA pour l’analyse.
- Une clé API reste une donnée sensible : elle est consultable par quiconque déverrouille le téléphone et ouvre l’écran Réglages. Pour un usage partagé, privilégier le mode Backend.

---

## Pour un APK plus tard

`eas.json` contient déjà un profil `preview` en APK Android. Le mode « Clé directe » rend l’APK autonome : aucun serveur à maintenir.

---

## Vérifications effectuées

- Compilation TypeScript de `shared/ai/` en mode strict : aucune erreur.
- Compilation TypeScript du backend (`app/`, `lib/`, `shared/`) : aucune erreur.
- Contrôle syntaxique des fichiers de l’application mobile (les types React Native ne sont disponibles qu’après `npm install`).
- Les appels réseau vers les quatre API n’ont pas été exécutés : ils demandent des clés réelles. Le bouton **Vérifier la clé** de l’écran Réglages sert précisément à valider chaque fournisseur depuis le téléphone.
