/**
 * embed.worker.js — Calcul des embeddings avec transformers.js
 * -------------------------------------------------------------
 * Tourne dans un Web Worker pour ne pas bloquer l'interface.
 * Le modèle (~120 Mo) est téléchargé depuis Hugging Face au premier
 * lancement, puis mis en cache par le navigateur.
 *
 * Messages reçus  : { id, type: 'embed', model, texts: string[] }
 * Messages envoyés : { id, type: 'result', vectors: number[][] }
 *                    { type: 'progress', file, progress }
 *                    { id, type: 'error', message }
 */
import { pipeline, env } from '@huggingface/transformers';

// Pas de modèles locaux : tout vient du Hub Hugging Face (puis du cache)
env.allowLocalModels = false;

let extractorPromise = null;

function getExtractor(model) {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', model, {
      dtype: 'q8', // version quantifiée : plus légère, précision suffisante
      progress_callback: (p) => {
        if (p.status === 'progress') {
          self.postMessage({ type: 'progress', file: p.file, progress: p.progress });
        }
      },
    }).catch((err) => {
      extractorPromise = null; // permet de réessayer plus tard
      throw err;
    });
  }
  return extractorPromise;
}

self.onmessage = async ({ data }) => {
  const { id, type, model, texts } = data;
  if (type !== 'embed') return;
  try {
    const extractor = await getExtractor(model);
    const vectors = [];
    // Traitement par lots pour limiter la mémoire
    for (let i = 0; i < texts.length; i += 16) {
      const output = await extractor(texts.slice(i, i + 16), { pooling: 'mean', normalize: true });
      vectors.push(...output.tolist());
    }
    self.postMessage({ id, type: 'result', vectors });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message || String(err) });
  }
};
