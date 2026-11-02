/**
 * Configuration Vite
 * - base './' : chemins relatifs, le site fonctionne quel que soit le nom
 *   du dépôt GitHub (https://<utilisateur>.github.io/<depot>/)
 * - les Web Workers (WebLLM, embeddings) sont compilés en modules ES
 */
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  optimizeDeps: {
    // transformers.js et WebLLM chargent eux-mêmes leurs fichiers WASM
    exclude: ['@huggingface/transformers', '@mlc-ai/web-llm'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000, // WebLLM et transformers.js sont volumineux
  },
});
