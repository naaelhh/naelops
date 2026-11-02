/**
 * expert.js — Mode Expert : appels directs aux API des fournisseurs
 * ------------------------------------------------------------------
 * Deux formats d'API sont gérés :
 *  - "anthropic" : API Messages de Claude
 *  - "openai"    : API Chat Completions (OpenAI, Mistral, Groq)
 *
 * Les réponses arrivent en streaming (Server-Sent Events) et sont
 * transmises token par token via le callback `onToken`.
 *
 * Si un proxy (Cloudflare Worker) est configuré, les requêtes passent par
 * `<proxy>/<fournisseur>/...` au lieu de l'URL officielle.
 */
import { PROVIDERS } from '../config.js';

/** Erreur « lisible » destinée à être affichée à l'utilisateur. */
export class ApiError extends Error {
  constructor(message, { status, kind } = {}) {
    super(message);
    this.status = status;
    this.kind = kind; // 'auth' | 'quota' | 'model' | 'network' | 'server' | 'request'
  }
}

/** URL de base effective (directe ou via le proxy). */
function baseUrl(providerId, proxyUrl) {
  if (proxyUrl) return `${proxyUrl.replace(/\/+$/, '')}/${providerId}`;
  return PROVIDERS[providerId].baseUrl;
}

/** En-têtes HTTP propres à chaque format d'API. */
function headers(provider, apiKey) {
  if (provider.type === 'anthropic') {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Autorise l'appel direct depuis un navigateur (CORS) chez Anthropic
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Envoie une conversation et stream la réponse.
 * @param {object} opts
 * @param {string} opts.providerId  - clé dans PROVIDERS
 * @param {string} opts.model
 * @param {string} opts.apiKey
 * @param {string} [opts.proxyUrl]
 * @param {string} opts.system      - prompt système (incluant le contexte RAG)
 * @param {Array}  opts.messages    - [{ role, content }]
 * @param {(t: string) => void} opts.onToken
 * @param {AbortSignal} [opts.signal]
 */
export async function streamChat({ providerId, model, apiKey, proxyUrl, system, messages, onToken, signal }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new ApiError(`Fournisseur inconnu : ${providerId}`, { kind: 'request' });
  if (!apiKey) {
    throw new ApiError(
      `Aucune clé API ${provider.label} enregistrée. Ouvre les Paramètres (⚙️) pour l'ajouter.`,
      { kind: 'auth' },
    );
  }

  const isAnthropic = provider.type === 'anthropic';
  const url = `${baseUrl(providerId, proxyUrl)}/${isAnthropic ? 'messages' : 'chat/completions'}`;
  const body = isAnthropic
    ? { model, system, messages, max_tokens: 8192, stream: true }
    : { model, messages: [{ role: 'system', content: system }, ...messages], stream: true };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers(provider, apiKey),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw networkError(provider, proxyUrl);
  }

  if (!res.ok) throw await httpError(res, provider);

  // Lecture du flux SSE
  for await (const data of readSSE(res.body, signal)) {
    if (data === '[DONE]') break;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      continue; // ligne incomplète ou keep-alive
    }

    if (isAnthropic) {
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        onToken(json.delta.text);
      } else if (json.type === 'error') {
        throw new ApiError(`Erreur Anthropic : ${json.error?.message || 'inconnue'}`, { kind: 'server' });
      }
    } else {
      if (json.error) {
        throw new ApiError(`Erreur ${provider.label} : ${json.error.message || json.error}`, { kind: 'server' });
      }
      const token = json.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    }
  }
}

/**
 * Récupère la liste des modèles disponibles pour la clé fournie.
 * Les 4 fournisseurs exposent GET /models → { data: [{ id }] }.
 */
export async function listModels({ providerId, apiKey, proxyUrl }) {
  const provider = PROVIDERS[providerId];
  let res;
  try {
    res = await fetch(`${baseUrl(providerId, proxyUrl)}/models?limit=100`, {
      headers: headers(provider, apiKey),
    });
  } catch {
    throw networkError(provider, proxyUrl);
  }
  if (!res.ok) throw await httpError(res, provider);
  const json = await res.json();
  return (json.data || []).map((m) => m.id).sort();
}

/* ---------- Lecture du flux Server-Sent Events ---------- */

/** Générateur asynchrone qui renvoie le contenu de chaque ligne `data:`. */
async function* readSSE(stream, signal) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // la dernière ligne peut être incomplète
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) yield trimmed.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ---------- Traduction des erreurs en messages clairs ---------- */

async function httpError(res, provider) {
  let detail = '';
  try {
    let json = await res.json();
    if (Array.isArray(json)) json = json[0] || {}; // format d'erreur de Google Gemini
    detail = json.error?.message || json.message || json.detail || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    /* corps non JSON */
  }
  const suffix = detail ? `\n\nDétail : ${detail}` : '';
  const name = provider.label;

  // Certains fournisseurs (Gemini) répondent 400 au lieu de 401 pour une clé invalide
  const status = res.status === 400 && /api[ _-]?key/i.test(detail) ? 401 : res.status;

  switch (status) {
    case 401:
    case 403:
      return new ApiError(`🔑 Clé API ${name} invalide ou non autorisée. Vérifie-la dans les Paramètres.${suffix}`, { status: res.status, kind: 'auth' });
    case 402:
    case 429:
      return new ApiError(`⏳ Quota dépassé ou trop de requêtes chez ${name}. Patiente un peu ou vérifie ton crédit / ta formule.${suffix}`, { status: res.status, kind: 'quota' });
    case 404:
      return new ApiError(`❓ Modèle ou point d'accès introuvable chez ${name}. Choisis un autre modèle (bouton « Actualiser » dans les Paramètres).${suffix}`, { status: res.status, kind: 'model' });
    case 400:
    case 422:
      return new ApiError(`⚠️ Requête refusée par ${name} (modèle invalide, contexte trop long…).${suffix}`, { status: res.status, kind: 'request' });
    case 529:
    case 503:
      return new ApiError(`🔥 ${name} est surchargé pour le moment. Réessaie dans quelques instants.${suffix}`, { status: res.status, kind: 'server' });
    default:
      return new ApiError(`Erreur ${res.status} de ${name}.${suffix}`, { status: res.status, kind: 'server' });
  }
}

/**
 * Un `fetch` qui échoue sans réponse = réseau coupé OU blocage CORS
 * (le navigateur ne permet pas de distinguer les deux).
 */
function networkError(provider, proxyUrl) {
  if (!navigator.onLine) {
    return new ApiError('📡 Pas de connexion Internet. Vérifie ton réseau, ou passe en mode Local.', { kind: 'network' });
  }
  const hint = proxyUrl
    ? `Vérifie que ton proxy (${proxyUrl}) est bien déployé et accessible.`
    : `Si le problème persiste, le navigateur bloque peut-être l'appel (CORS) : déploie le Cloudflare Worker fourni dans /worker et renseigne son URL dans les Paramètres.`;
  return new ApiError(`🌐 Impossible de joindre ${provider.label} (problème réseau ou CORS). ${hint}`, { kind: 'network' });
}
