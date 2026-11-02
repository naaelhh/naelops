/**
 * webllm.worker.js — Exécute WebLLM dans un Web Worker
 * -----------------------------------------------------
 * Le calcul (WebGPU) se fait hors du thread principal pour que
 * l'interface reste fluide pendant le chargement et la génération.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
