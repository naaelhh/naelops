/**
 * rag.js — Base de connaissances (RAG) 100 % navigateur
 * ------------------------------------------------------
 * 1. Charge l'index des docs (docs/index.json, généré au build)
 * 2. Découpe chaque fichier Markdown en morceaux (par titres puis par taille)
 * 3. Calcule les embeddings (transformers.js, dans un Web Worker)
 *    et les met en cache dans IndexedDB (recalcul seulement si le doc change)
 * 4. À chaque question : similarité cosinus → passages les plus pertinents
 */
import { EMBEDDING_MODEL } from '../config.js';

const DOCS_BASE = `${import.meta.env.BASE_URL}docs/`;
const CHUNK_SIZE = 900;      // taille cible d'un morceau (caractères)
// Score minimal d'un passage. Avec e5, la similarité est « tassée » :
// ~0.80-0.86 = hors sujet, > 0.88 = pertinent (calibré sur les docs d'exemple)
const MIN_SCORE = 0.88;
const LEXICAL_WEIGHT = 0.08; // bonus si les mots de la question apparaissent tels quels
const MAX_GAP = 0.06;        // on ignore les passages trop loin du meilleur

/** État courant de l'index (lu par l'interface). */
export const ragState = {
  status: 'idle',   // 'idle' | 'loading' | 'ready' | 'error' | 'empty'
  message: '',
  files: 0,
  personalFiles: 0,
  chunks: [],       // [{ file, title, heading, text, vector }]
};

const listeners = new Set();
export function onRagChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setState(patch) {
  Object.assign(ragState, patch);
  listeners.forEach((fn) => fn(ragState));
}

/* ---------- Worker d'embeddings ---------- */

let worker = null;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./embed.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      if (ragState.status === 'loading' && data.progress != null) {
        setState({ message: `Téléchargement du modèle d'embedding… ${Math.round(data.progress)} %` });
      }
      return;
    }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data.vectors);
  };
  return worker;
}

/** Calcule les embeddings d'une liste de textes (dans le worker). */
function embed(texts) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: 'embed', model: EMBEDDING_MODEL, texts });
  });
}

/* ---------- Cache IndexedDB ---------- */

const DB_NAME = 'naelops-rag';
const STORE = 'embeddings';
const PERSONAL = 'personal'; // documents perso importés par l'utilisateur (texte + vecteurs)

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(PERSONAL)) db.createObjectStore(PERSONAL, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined; // IndexedDB indisponible (navigation privée…) : pas de cache
  }
}

async function cachePut(key, value) {
  try {
    const db = await openDB();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
  } catch {
    /* sans cache, on recalculera au prochain chargement */
  }
}

/** Vide le cache des embeddings (bouton « Réindexer »). */
export async function clearCache() {
  try {
    const db = await openDB();
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch {
    /* rien à faire */
  }
}

/* ---------- Découpage des documents ---------- */

/**
 * Découpe un Markdown en morceaux : d'abord par titre (#, ##, ###),
 * puis par paragraphes si une section dépasse CHUNK_SIZE.
 * Les blocs de code ne sont jamais coupés en deux.
 */
export function chunkMarkdown(markdown, fileTitle) {
  const sections = [];
  let heading = fileTitle;
  let buffer = [];
  let inCode = false;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ heading, text });
    buffer = [];
  };

  for (const line of markdown.split('\n')) {
    if (line.trim().startsWith('```')) inCode = !inCode;
    const m = !inCode && line.match(/^(#{1,3})\s+(.*)/);
    if (m) {
      flush();
      heading = m[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  // Sous-découpage des sections trop longues (par paragraphes / blocs)
  const chunks = [];
  for (const { heading: h, text } of sections) {
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ heading: h, text });
      continue;
    }
    let current = '';
    for (const para of splitParagraphs(text).flatMap(splitLong)) {
      if (current && current.length + para.length > CHUNK_SIZE) {
        chunks.push({ heading: h, text: current.trim() });
        current = '';
      }
      current += para + '\n\n';
    }
    if (current.trim()) chunks.push({ heading: h, text: current.trim() });
  }
  return chunks;
}

/** Coupe un paragraphe trop long (texte de PDF) en morceaux, sur une fin de phrase si possible. */
function splitLong(para) {
  if (para.length <= CHUNK_SIZE * 1.5 || para.trimStart().startsWith('```')) return [para];
  const parts = [];
  let rest = para;
  while (rest.length > CHUNK_SIZE) {
    const window = rest.slice(0, CHUNK_SIZE);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'));
    if (cut < CHUNK_SIZE * 0.5) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = CHUNK_SIZE;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

/** Sépare en paragraphes en gardant chaque bloc de code entier. */
function splitParagraphs(text) {
  const parts = [];
  let current = [];
  let inCode = false;
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) inCode = !inCode;
    if (!inCode && line.trim() === '' && current.length) {
      parts.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) parts.push(current.join('\n'));
  return parts.filter((p) => p.trim());
}

/* ---------- Construction de l'index ---------- */

let buildPromise = null;

/** Construit l'index (une seule fois ; les appels suivants attendent le même résultat). */
export function buildIndex({ force = false } = {}) {
  if (buildPromise && !force) return buildPromise;
  buildPromise = doBuild().catch((err) => {
    console.error('[RAG]', err);
    setState({ status: 'error', message: `Erreur RAG : ${err.message}` });
    buildPromise = null;
  });
  return buildPromise;
}

async function doBuild() {
  setState({ status: 'loading', message: 'Chargement de la base de connaissances…', chunks: [] });

  const res = await fetch(`${DOCS_BASE}index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('index des docs introuvable (docs/index.json)');
  const index = await res.json();
  const files = index.files || [];

  const all = [];
  for (const [i, file] of files.entries()) {
    // La clé de cache inclut le hash du fichier : un doc modifié est réindexé
    const key = `${EMBEDDING_MODEL}|${file.path}|${file.hash}`;
    let entry = await cacheGet(key);

    if (!entry) {
      setState({ message: `Indexation de ${file.path} (${i + 1}/${files.length})…` });
      const md = await (await fetch(`${DOCS_BASE}${file.path}`)).text();
      const chunks = chunkMarkdown(md, file.title);
      // Préfixe « passage: » requis par les modèles e5 ; on ajoute titre et section
      const vectors = await embed(chunks.map((c) => `passage: ${file.title} — ${c.heading}\n${c.text}`));
      entry = { chunks, vectors };
      await cachePut(key, entry);
    }

    entry.chunks.forEach((c, j) => {
      all.push({ file: file.path, title: file.title, heading: c.heading, text: c.text, vector: entry.vectors[j] });
    });
  }

  // Documents perso (déjà découpés et vectorisés lors de l'import)
  const personal = await personalGetAll();
  for (const doc of personal) {
    if (doc.model !== EMBEDDING_MODEL) continue;
    all.push(...personalChunks(doc));
  }

  const total = files.length + personal.length;
  setState({
    status: total ? 'ready' : 'empty',
    files: files.length,
    personalFiles: personal.length,
    chunks: all,
    message: total
      ? `${files.length} doc(s)${personal.length ? ` + ${personal.length} perso` : ''}, ${all.length} passages indexés`
      : 'Aucun document',
  });
}

/* ---------- Documents perso (privés, stockés dans ce navigateur) ---------- */

/** Passages d'un document perso, au format de l'index. */
function personalChunks(doc) {
  return doc.chunks.map((c, j) => ({
    file: doc.name,
    title: doc.name,
    heading: c.heading,
    text: c.text,
    vector: doc.vectors[j],
    personal: true,
  }));
}

async function personalStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PERSONAL, mode);
    const req = fn(tx.objectStore(PERSONAL));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

function personalGetAll() {
  return personalStore('readonly', (st) => st.getAll()).catch(() => []);
}

/** Liste des documents perso (sans le texte ni les vecteurs). */
export async function listPersonalDocs() {
  const docs = await personalGetAll();
  return docs
    .map(({ id, name, chars, addedAt }) => ({ id, name, chars, addedAt }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Ajoute un document perso à la base : découpe, vectorisation, stockage.
 * Un document du même nom est remplacé.
 * @param {{ name: string, text: string }} doc
 * @param {(msg: string) => void} [onProgress]
 */
export async function addPersonalDoc({ name, text }, onProgress) {
  const existing = (await personalGetAll()).find((d) => d.name === name);
  const chunks = chunkMarkdown(text, name);
  const vectors = [];
  // Vectorisation par lots pour afficher la progression sur les gros PDF
  for (let i = 0; i < chunks.length; i += 32) {
    onProgress?.(`Indexation de ${name} : ${Math.min(i + 32, chunks.length)}/${chunks.length} passages…`);
    const batch = chunks.slice(i, i + 32);
    vectors.push(...(await embed(batch.map((c) => `passage: ${name} — ${c.heading}\n${c.text}`))));
  }
  const doc = {
    id: existing?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    chars: text.length,
    addedAt: Date.now(),
    model: EMBEDDING_MODEL,
    chunks,
    vectors,
  };
  await personalStore('readwrite', (st) => st.put(doc));
  await refreshPersonal();
  return { id: doc.id, name, chunks: chunks.length };
}

export async function removePersonalDoc(id) {
  await personalStore('readwrite', (st) => st.delete(id));
  await refreshPersonal();
}

/** Remplace les passages perso de l'index déjà construit (sans tout recharger). */
async function refreshPersonal() {
  if (buildPromise) await buildPromise; // une indexation est peut-être en cours
  if (ragState.status !== 'ready' && ragState.status !== 'empty') return buildIndex({ force: true });
  const personal = (await personalGetAll()).filter((d) => d.model === EMBEDDING_MODEL);
  const chunks = [...ragState.chunks.filter((c) => !c.personal), ...personal.flatMap(personalChunks)];
  setState({
    status: chunks.length ? 'ready' : 'empty',
    personalFiles: personal.length,
    chunks,
    message: `${ragState.files} doc(s)${personal.length ? ` + ${personal.length} perso` : ''}, ${chunks.length} passages indexés`,
  });
}

/* ---------- Recherche ---------- */

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vecteurs normalisés → produit scalaire = similarité cosinus
}

/** Mots trop courants pour être significatifs dans la recherche lexicale. */
const STOPWORDS = new Set(
  'les des une un sur pour avec dans par pas que qui quoi comment faire est sont the and for with mon ma mes ton ta tes son sa ses aux du de la le en et ou je tu il nous vous ils on ce cet cette ces quel quelle quels quelles moi'.split(' '),
);

/** Normalise un texte en liste de mots (minuscules, sans accents). */
function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9.-]+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, '')) // « ZEBRA-42. » → « zebra-42 » (garde 10.42.0.7)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Part des mots de la question présents dans le passage (0 → 1). */
function lexicalScore(queryWords, text) {
  if (!queryWords.length) return 0;
  const words = new Set(tokenize(text));
  return queryWords.filter((w) => words.has(w)).length / queryWords.length;
}

/**
 * Retrouve les passages les plus pertinents pour une question.
 * Recherche hybride : similarité sémantique (embeddings) + bonus lexical.
 * @returns {Promise<Array<{ file, heading, text, score }>>}
 */
export async function search(query, k = 4) {
  await buildIndex();
  if (ragState.status !== 'ready' || !ragState.chunks.length) return [];

  const [qVec] = await embed([`query: ${query}`]);
  const queryWords = [...new Set(tokenize(query))];
  const ranked = ragState.chunks
    .map((c) => ({
      ...c,
      score: dot(qVec, c.vector) + LEXICAL_WEIGHT * lexicalScore(queryWords, `${c.heading} ${c.text}`),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.score ?? 0;
  return ranked
    .filter((c) => c.score >= MIN_SCORE && c.score >= best - MAX_GAP)
    .slice(0, k)
    .map(({ vector, ...rest }) => rest);
}

/** Met en forme les passages pour les injecter dans le prompt système. */
export function formatContext(passages) {
  if (!passages.length) return '';
  const blocks = passages.map(
    (p, i) => `[${i + 1}] Source : ${p.file}${p.personal ? ' (document personnel)' : ''} — ${p.heading}\n${p.text}`,
  );
  return `\n\n---\nExtraits de la base de connaissances interne (utilise-les en priorité et cite la source sous la forme « (source : nom-du-fichier.md) ») :\n\n${blocks.join('\n\n')}\n---`;
}
