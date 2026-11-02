/**
 * config.js — Configuration centrale de NaelOps
 * ------------------------------------------------
 * Prompt système, fournisseurs d'API, modèles locaux WebLLM
 * et suggestions de l'écran d'accueil.
 */

/** Prompt système envoyé à l'IA (modes Expert et Local). */
export const SYSTEM_PROMPT = `Tu es NaelOps, un assistant expert en informatique.

Spécialités principales : administration systèmes et réseaux —
Linux, Windows Server, Active Directory, Cisco IOS, pfSense, Proxmox,
Hyper-V, Zabbix, GLPI, scripting Bash et PowerShell.

Tu maîtrises aussi : cloud (AWS, Azure), cybersécurité, virtualisation,
DevOps (Docker, Kubernetes, Ansible, CI/CD), bases de données
et développement.

Règles :
- Réponds en français, de façon claire et concise.
- Donne des commandes et configurations précises, et explique-les.
- Signale toujours les commandes dangereuses (suppression, reboot,
  modification en production) et propose une sauvegarde avant.
- Si des extraits de documentation sont fournis, appuie-toi dessus
  en priorité et cite la source.
- Si tu n'es pas sûr d'une information, dis-le clairement au lieu
  d'inventer.`;

/**
 * Fournisseurs du mode Expert.
 * - `type` : format d'API ("anthropic" ou "openai" = compatible OpenAI)
 * - `baseUrl` : URL de base de l'API officielle
 * - `models` : modèles proposés par défaut (vérifiés dans la doc officielle,
 *   novembre 2026). Le bouton « Actualiser » des Paramètres récupère
 *   la liste à jour directement depuis l'API du fournisseur.
 */
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recommandé)' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (le plus puissant)' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (rapide, économique)' },
    ],
  },
  openai: {
    label: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    models: [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (équilibré)' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra (le plus puissant)' },
      { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra (rapide)' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna (économique)' },
    ],
  },
  mistral: {
    label: 'Mistral AI',
    type: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyHint: 'clé Mistral',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large (le plus puissant)' },
      { id: 'mistral-small-latest', label: 'Mistral Small (rapide)' },
      { id: 'ministral-8b-latest', label: 'Ministral 8B (économique)' },
    ],
  },
  groq: {
    label: 'Groq',
    type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_…',
    models: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (recommandé)' },
      { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (très rapide)' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (instantané)' },
    ],
  },
  gemini: {
    label: 'Google Gemini',
    type: 'openai', // via l'endpoint compatible OpenAI de Google
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (recommandé)' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (très rapide)' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyHint: 'sk-or-…',
    // Les modèles « :free » sont gratuits ; la liste change souvent (bouton « Actualiser »)
    models: [
      { id: 'openrouter/free', label: 'Routeur gratuit (choisit un modèle gratuit disponible)' },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B (gratuit)' },
      { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (gratuit)' },
    ],
  },
};

/** Fournisseurs ayant une offre gratuite (signalés dans l'interface). */
export const FREE_PROVIDERS = ['groq', 'gemini', 'openrouter', 'mistral'];

/**
 * Modèles du mode Local (WebLLM).
 * IDs vérifiés dans `prebuiltAppConfig` de @mlc-ai/web-llm 0.2.87.
 */
export const LOCAL_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B Instruct (~1 Go, rapide)' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B Instruct (~2 Go, meilleur)' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B Instruct (~2 Go)' },
];

/** Modèle d'embedding multilingue (transformers.js) utilisé par le RAG. */
export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

/** Suggestions affichées sur l'écran d'accueil. */
export const SUGGESTIONS = [
  { icon: '🔀', text: 'Configurer un VLAN sur un switch Cisco' },
  { icon: '🖥️', text: 'Créer une VM Ubuntu sur Proxmox' },
  { icon: '👥', text: 'Script PowerShell pour créer des utilisateurs AD depuis un CSV' },
  { icon: '🛡️', text: 'Règles de pare-feu pfSense pour une DMZ' },
];

/** Paramètres par défaut (fusionnés avec ceux du localStorage). */
export const DEFAULT_SETTINGS = {
  mode: 'expert',            // "expert" | "local"
  provider: 'groq',          // Groq : offre gratuite, idéal pour démarrer
  models: {},                // modèle choisi par fournisseur { groq: '...', ... }
  apiKeys: {},               // clés API par fournisseur (localStorage uniquement)
  proxyUrl: '',              // URL du Cloudflare Worker (optionnel)
  localModel: LOCAL_MODELS[0].id,
  ragEnabled: true,
};
