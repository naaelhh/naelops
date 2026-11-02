/**
 * NaelOps — Proxy CORS minimal (Cloudflare Worker)
 * -------------------------------------------------
 * À utiliser seulement si un fournisseur bloque les appels directs
 * depuis le navigateur (erreur « problème réseau ou CORS »).
 *
 * Routes :  https://<worker>/<fournisseur>/<chemin>
 *   ex. POST /groq/chat/completions → https://api.groq.com/openai/v1/chat/completions
 *
 * Sécurité :
 *  - le Worker ne stocke AUCUNE clé : la clé de l'utilisateur est simplement
 *    transmise au fournisseur (en-tête Authorization / x-api-key)
 *  - seuls les fournisseurs connus sont joignables (pas de proxy ouvert)
 *  - seules les origines listées dans ALLOWED_ORIGINS sont acceptées
 */

const UPSTREAMS = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
};

// En-têtes de la requête transmis au fournisseur
const FORWARDED_HEADERS = ['content-type', 'authorization', 'x-api-key', 'anthropic-version', 'anthropic-beta'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const originOk = allowed.length === 0 || allowed.includes('*') || allowed.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': FORWARDED_HEADERS.join(', ') + ', anthropic-dangerous-direct-browser-access',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    // Pré-vérification CORS du navigateur
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    }
    if (!originOk) {
      return json({ error: { message: `Origine non autorisée : ${origin}` } }, 403, cors);
    }

    // /<fournisseur>/<reste du chemin>
    const url = new URL(request.url);
    const [, provider, ...rest] = url.pathname.split('/');
    const upstream = UPSTREAMS[provider];
    if (!upstream) {
      return json({ error: { message: 'Fournisseur inconnu. Utilise /anthropic, /openai, /mistral, /groq, /gemini ou /openrouter.' } }, 404, cors);
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstreamRes = await fetch(`${upstream}/${rest.join('/')}${url.search}`, {
      method: request.method,
      headers,
      // Corps lu en entier (requêtes de chat légères) : compatible partout
      body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
    });

    // On renvoie la réponse telle quelle (y compris le streaming SSE) + en-têtes CORS
    const resHeaders = new Headers(upstreamRes.headers);
    for (const [k, v] of Object.entries(cors)) resHeaders.set(k, v);
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}
