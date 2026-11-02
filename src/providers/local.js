/**
 * local.js — Mode Local : petit modèle exécuté dans le navigateur (WebLLM)
 * -------------------------------------------------------------------------
 * - Nécessite WebGPU (Chrome/Edge récents, Safari récent)
 * - Le modèle est téléchargé une seule fois puis mis en cache par le
 *   navigateur (Cache Storage) : les chargements suivants sont rapides
 *   et fonctionnent hors ligne.
 */
let engine = null;        // moteur WebLLM (une seule instance)
let loadedModel = null;   // ID du modèle actuellement chargé
let loadingPromise = null;

/**
 * Vérifie la prise en charge de WebGPU.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function checkWebGPU() {
  if (!('gpu' in navigator)) {
    return { ok: false, reason: "Ce navigateur ne prend pas en charge WebGPU." };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'WebGPU est présent mais aucun GPU compatible n\'a été trouvé.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `WebGPU indisponible : ${err.message}` };
  }
}

export function isLoaded(modelId) {
  return engine !== null && loadedModel === modelId;
}

/**
 * Charge (ou change) le modèle local.
 * @param {string} modelId
 * @param {(p: { progress: number, text: string }) => void} onProgress
 */
export async function loadModel(modelId, onProgress) {
  if (isLoaded(modelId)) return engine;
  if (loadingPromise) await loadingPromise.catch(() => {});
  if (isLoaded(modelId)) return engine;

  loadingPromise = (async () => {
    const progressCb = (report) => onProgress?.({ progress: report.progress ?? 0, text: report.text ?? '' });

    if (engine) {
      // Le moteur existe déjà : on recharge simplement un autre modèle
      engine.setInitProgressCallback(progressCb);
      await engine.reload(modelId);
    } else {
      // Import dynamique : WebLLM (~6 Mo) n'est chargé que si le mode Local est utilisé
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('./webllm.worker.js', import.meta.url), { type: 'module' });
      engine = await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: progressCb });
    }
    loadedModel = modelId;
    return engine;
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    loadedModel = null;
    // Le worker WebLLM renvoie parfois une simple chaîne : on la convertit en Error
    throw err instanceof Error ? err : new Error(String(err).replace(/^Error:\s*/, ''));
  } finally {
    loadingPromise = null;
  }
}

/**
 * Génère une réponse en streaming avec le modèle local.
 * Les petits modèles ont un contexte limité (~4k tokens) : l'historique
 * est donc tronqué aux derniers échanges.
 */
export async function streamChat({ modelId, system, messages, onToken, signal, onProgress }) {
  const eng = await loadModel(modelId, onProgress);

  const onAbort = () => eng.interruptGenerate();
  signal?.addEventListener('abort', onAbort);

  try {
    const chunks = await eng.chat.completions.create({
      messages: [{ role: 'system', content: system }, ...messages.slice(-6)],
      stream: true,
      temperature: 0.4,
      max_tokens: 1536,
    });
    for await (const chunk of chunks) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (signal?.aborted) throw new DOMException('Arrêté', 'AbortError');
}
