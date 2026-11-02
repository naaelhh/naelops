/**
 * storage.js — Persistance dans le localStorage
 * ----------------------------------------------
 * Paramètres (dont les clés API) et historique des conversations.
 * Rien n'est envoyé à un serveur : tout reste dans le navigateur.
 */
import { DEFAULT_SETTINGS } from './config.js';

const SETTINGS_KEY = 'naelops.settings';
const CONVS_KEY = 'naelops.conversations';

/** Lecture JSON tolérante aux erreurs (navigation privée, données corrompues…). */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[storage] Écriture impossible :', err);
  }
}

/* ---------- Paramètres ---------- */

export function loadSettings() {
  const saved = readJSON(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings) {
  writeJSON(SETTINGS_KEY, settings);
}

/* ---------- Conversations ---------- */

/**
 * Une conversation : { id, title, createdAt, updatedAt,
 *   messages: [{ role: 'user'|'assistant', content, sources?, meta? }] }
 */
export function loadConversations() {
  return readJSON(CONVS_KEY, []);
}

export function saveConversations(conversations) {
  writeJSON(CONVS_KEY, conversations);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Efface l'historique (les paramètres sont conservés). */
export function clearConversations() {
  localStorage.removeItem(CONVS_KEY);
}
