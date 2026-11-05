/**
 * main.js — Point d'entrée de NaelOps
 * ------------------------------------
 * Relie l'interface (chat, barre latérale, paramètres) aux deux modes
 * de génération (Expert via API, Local via WebLLM) et au RAG.
 */
import './styles.css';
import { SYSTEM_PROMPT, PROVIDERS, FREE_PROVIDERS, LOCAL_MODELS, SUGGESTIONS, detectProvider } from './config.js';
import { loadSettings, saveSettings, loadConversations, saveConversations, clearConversations, newId } from './storage.js';
import { renderMarkdown, copyText } from './ui/markdown.js';
import * as expert from './providers/expert.js';
import * as local from './providers/local.js';
import { ragState, onRagChange, buildIndex, search, formatContext, clearCache } from './rag/rag.js';

/* ==========================================================================
   État de l'application
   ========================================================================== */
const state = {
  settings: loadSettings(),
  conversations: loadConversations(),
  currentId: null,
  abort: null,          // AbortController de la génération en cours
  webgpu: null,         // résultat de checkWebGPU()
  localProgress: null,  // { progress, text } pendant le chargement du modèle local
};

const $ = (sel) => document.querySelector(sel);
const el = {
  sidebar: $('#sidebar'), backdrop: $('#backdrop'), convList: $('#convList'),
  messages: $('#messages'), welcome: $('#welcome'), suggestions: $('#suggestions'),
  input: $('#input'), send: $('#send'), composer: $('#composer'),
  banner: $('#banner'), modelBadge: $('#modelBadge'), ragBadge: $('#ragBadge'),
  settings: $('#settings'),
};

function persistSettings() {
  saveSettings(state.settings);
  updateTopbar();
  updateBanner();
}

function currentConv() {
  return state.conversations.find((c) => c.id === state.currentId) || null;
}

/** Modèle sélectionné pour le fournisseur courant. */
function expertModel(providerId = state.settings.provider) {
  return state.settings.models[providerId] || PROVIDERS[providerId].models[0].id;
}

/* ==========================================================================
   Barre latérale : liste des conversations
   ========================================================================== */
function renderSidebar() {
  el.convList.innerHTML = '';
  const convs = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!convs.length) {
    el.convList.innerHTML = '<p class="conv-empty">Aucune conversation pour l\'instant.</p>';
    return;
  }

  // Regroupement par date (Aujourd'hui / 7 derniers jours / Plus ancien)
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const groupOf = (t) => (t >= startOfDay ? "Aujourd'hui" : t >= startOfDay - 6 * 864e5 ? '7 derniers jours' : 'Plus ancien');
  let lastGroup = null;

  for (const conv of convs) {
    const group = groupOf(conv.updatedAt);
    if (group !== lastGroup) {
      const g = document.createElement('div');
      g.className = 'conv-group';
      g.textContent = group;
      el.convList.append(g);
      lastGroup = group;
    }
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === state.currentId ? ' active' : '');
    item.innerHTML = '<span class="title"></span><button class="del" type="button" title="Supprimer">🗑</button>';
    item.querySelector('.title').textContent = conv.title;
    item.addEventListener('click', () => openConversation(conv.id));
    item.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });
    el.convList.append(item);
  }
}

function openConversation(id) {
  if (state.abort) state.abort.abort();
  state.currentId = id;
  renderSidebar();
  renderMessages();
  closeSidebar();
}

function newConversation() {
  if (state.abort) state.abort.abort();
  state.currentId = null;
  renderSidebar();
  renderMessages();
  closeSidebar();
  el.input.focus();
}

function deleteConversation(id) {
  if (!confirm('Supprimer cette conversation ?')) return;
  state.conversations = state.conversations.filter((c) => c.id !== id);
  saveConversations(state.conversations);
  if (state.currentId === id) state.currentId = null;
  renderSidebar();
  renderMessages();
}

function openSidebar() { el.sidebar.classList.add('open'); el.backdrop.hidden = false; }
function closeSidebar() { el.sidebar.classList.remove('open'); el.backdrop.hidden = true; }

/* ==========================================================================
   Affichage des messages
   ========================================================================== */
function renderMessages() {
  el.messages.querySelectorAll('.msg').forEach((n) => n.remove());
  const conv = currentConv();
  el.welcome.hidden = !!conv?.messages.length;
  conv?.messages.forEach((m) => el.messages.append(createMessageEl(m)));
  scrollToBottom(true);
}

/** Crée le DOM d'un message (utilisateur ou assistant). */
function createMessageEl(msg) {
  const node = document.createElement('div');
  node.className = `msg ${msg.role}`;
  node.innerHTML = `<div class="avatar">${msg.role === 'user' ? 'Toi' : '&gt;_'}</div><div class="body"></div>`;
  updateMessageEl(node, msg);
  return node;
}

/** Met à jour le contenu d'un message (appelé en boucle pendant le streaming). */
function updateMessageEl(node, msg, { streaming = false, status = '' } = {}) {
  const body = node.querySelector('.body');

  if (msg.role === 'user') {
    body.innerHTML = '<div class="bubble"></div>';
    body.firstChild.textContent = msg.content;
    return;
  }

  body.innerHTML = '';
  if (!msg.content && status) {
    body.innerHTML = `<span class="status-thinking cursor">${status}</span>`;
  } else {
    const md = document.createElement('div');
    md.className = 'md' + (streaming ? ' cursor' : '');
    renderMarkdown(md, msg.content);
    body.append(md);
  }

  if (msg.error) {
    const err = document.createElement('div');
    err.className = 'error';
    err.textContent = msg.error;
    body.append(err);
  }

  // Sources RAG utilisées pour cette réponse
  if (msg.sources?.length && !streaming) {
    const src = document.createElement('div');
    src.className = 'sources';
    src.innerHTML = '<span>📚 Sources :</span>';
    for (const file of msg.sources) {
      const a = document.createElement('a');
      a.className = 'source-chip';
      a.href = `${import.meta.env.BASE_URL}docs/${file}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = file;
      src.append(a);
    }
    body.append(src);
  }

  if (!streaming && msg.meta) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<span></span>${msg.content ? '<button type="button">⧉ Copier la réponse</button>' : ''}`;
    meta.querySelector('span').textContent = msg.meta;
    meta.querySelector('button')?.addEventListener('click', (e) => copyText(msg.content, e.currentTarget));
    body.append(meta);
  }
}

/** Fait défiler vers le bas, sauf si l'utilisateur est remonté lire. */
function scrollToBottom(force = false) {
  const m = el.messages;
  const nearBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 140;
  if (force || nearBottom) m.scrollTop = m.scrollHeight;
}

function renderSuggestions() {
  el.suggestions.innerHTML = '';
  for (const s of SUGGESTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggestion';
    b.innerHTML = '<span class="ico"></span><span class="txt"></span>';
    b.querySelector('.ico').textContent = s.icon;
    b.querySelector('.txt').textContent = s.text;
    b.addEventListener('click', () => sendMessage(s.text));
    el.suggestions.append(b);
  }
}

/* ==========================================================================
   Envoi d'un message et génération de la réponse
   ========================================================================== */
async function sendMessage(text) {
  text = text.trim();
  if (!text || state.abort) return;

  const { settings } = state;
  const mode = settings.mode;

  // Mode Local sans WebGPU : on prévient et on propose le mode Expert
  if (mode === 'local') {
    state.webgpu ??= await local.checkWebGPU();
    if (!state.webgpu.ok) {
      updateBanner();
      return;
    }
  }

  // Création de la conversation si besoin
  let conv = currentConv();
  if (!conv) {
    conv = { id: newId(), title: text.slice(0, 60), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    state.conversations.push(conv);
    state.currentId = conv.id;
  }

  const userMsg = { role: 'user', content: text };
  const botMsg = {
    role: 'assistant',
    content: '',
    meta: mode === 'expert'
      ? `${PROVIDERS[settings.provider].label} · ${expertModel()}`
      : `Local · ${settings.localModel.replace(/-q4f.*$/, '')}`,
  };
  // Historique envoyé au modèle : on retire les échanges dont la réponse
  // a échoué, pour garder une alternance user / assistant propre
  const history = [];
  for (const m of conv.messages) {
    if (m.role === 'assistant' && !m.content) history.pop();
    else history.push({ role: m.role, content: m.content });
  }
  history.push({ role: 'user', content: text });
  history.splice(0, Math.max(0, history.length - 20));
  if (history[0]?.role === 'assistant') history.shift();

  conv.messages.push(userMsg, botMsg);
  conv.updatedAt = Date.now();
  saveConversations(state.conversations);

  el.input.value = '';
  autoResize();
  el.welcome.hidden = true;
  renderSidebar();
  el.messages.append(createMessageEl(userMsg));
  const botNode = createMessageEl(botMsg);
  el.messages.append(botNode);
  scrollToBottom(true);

  state.abort = new AbortController();
  setGenerating(true);

  // Rendu limité à une fois par frame pendant le streaming
  let frame = 0;
  const schedule = (status) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateMessageEl(botNode, botMsg, { streaming: true, status });
      scrollToBottom();
    });
  };

  try {
    // 1) Recherche dans la base de connaissances
    let system = SYSTEM_PROMPT;
    if (settings.ragEnabled) {
      updateMessageEl(botNode, botMsg, { streaming: true, status: '🔎 Recherche dans la base de connaissances…' });
      try {
        const passages = await search(text, mode === 'local' ? 3 : 5);
        if (passages.length) {
          system += formatContext(passages);
          botMsg.sources = [...new Set(passages.map((p) => p.file))];
        }
      } catch (err) {
        console.warn('[RAG] recherche impossible :', err);
      }
    }
    if (state.abort.signal.aborted) throw new DOMException('Arrêté', 'AbortError');

    // 2) Génération en streaming
    const onToken = (t) => {
      botMsg.content += t;
      schedule();
    };

    if (mode === 'expert') {
      updateMessageEl(botNode, botMsg, { streaming: true, status: 'Réflexion…' });
      await expert.streamChat({
        providerId: settings.provider,
        model: expertModel(),
        apiKey: settings.apiKeys[settings.provider],
        proxyUrl: settings.proxyUrl,
        system,
        messages: history,
        onToken,
        signal: state.abort.signal,
      });
    } else {
      const status = local.isLoaded(settings.localModel) ? 'Réflexion…' : '⬇ Chargement du modèle local…';
      updateMessageEl(botNode, botMsg, { streaming: true, status });
      await local.streamChat({
        modelId: settings.localModel,
        system,
        messages: history,
        onToken,
        signal: state.abort.signal,
        onProgress: onLocalProgress,
      });
    }
    if (!botMsg.content) botMsg.error = 'Le modèle n\'a renvoyé aucune réponse.';
  } catch (err) {
    if (err.name === 'AbortError') {
      botMsg.content += botMsg.content ? '\n\n*⏹ Génération arrêtée.*' : '*⏹ Génération arrêtée.*';
    } else {
      console.error(err);
      botMsg.error = err instanceof expert.ApiError ? err.message : `Erreur : ${err.message || err}`;
    }
  } finally {
    cancelAnimationFrame(frame);
    state.abort = null;
    setGenerating(false);
    conv.updatedAt = Date.now();
    saveConversations(state.conversations);
    // La conversation affichée a pu changer pendant la génération
    if (botNode.isConnected) updateMessageEl(botNode, botMsg);
    scrollToBottom();
  }
}

function setGenerating(on) {
  el.send.classList.toggle('stop', on);
  el.send.setAttribute('aria-label', on ? 'Arrêter' : 'Envoyer');
  el.send.innerHTML = on
    ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z"/></svg>';
}

/* ==========================================================================
   Barre du haut, bannière d'information, mode
   ========================================================================== */
function setMode(mode) {
  state.settings.mode = mode;
  persistSettings();
  if (mode === 'local' && state.webgpu === null) {
    local.checkWebGPU().then((r) => {
      state.webgpu = r;
      updateBanner();
      updateSettingsStatus();
    });
  }
}

function updateTopbar() {
  const { mode, provider, localModel } = state.settings;
  document.querySelectorAll('.mode-switch button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  });
  el.modelBadge.textContent = mode === 'expert'
    ? `${PROVIDERS[provider].label.split(' ')[0]} · ${expertModel()}`
    : localModel.replace(/-q4f.*$/, '');
}

/** Bannière contextuelle : clé manquante, WebGPU absent, chargement du modèle local… */
function updateBanner() {
  const { mode, provider, apiKeys } = state.settings;
  const b = el.banner;
  b.className = 'banner';
  b.innerHTML = '';

  if (mode === 'expert' && !apiKeys[provider]) {
    b.innerHTML = `<span>🔑 Aucune clé API ${PROVIDERS[provider].label} enregistrée.</span>`;
    b.append(button('Ajouter ma clé', openSettings), button('Passer en mode Local', () => setMode('local')));
    b.hidden = false;
    return;
  }

  if (mode === 'local') {
    if (state.webgpu && !state.webgpu.ok) {
      b.innerHTML = `<span>⚠️ ${state.webgpu.reason} Le mode Local nécessite WebGPU : utilise un navigateur récent
        (Chrome / Edge 113+, Safari 26+) ou passe en mode Expert.</span>`;
      b.append(button('Passer en mode Expert', () => setMode('expert')));
      b.hidden = false;
      return;
    }
    if (state.localProgress) {
      b.className = 'banner info';
      b.innerHTML = `<span>⬇ Chargement du modèle local (mis en cache pour les prochaines fois)…</span>${progressHTML(state.localProgress)}`;
      b.hidden = false;
      return;
    }
    if (!local.isLoaded(state.settings.localModel)) {
      b.className = 'banner info';
      b.innerHTML = '<span>💻 Mode Local : gratuit et hors ligne, mais moins précis que le mode Expert. Le modèle sera téléchargé au premier message.</span>';
      b.hidden = false;
      return;
    }
  }
  b.hidden = true;
}

function button(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function progressHTML({ progress, text }) {
  const pct = Math.round((progress || 0) * 100);
  const safe = (text || '').replace(/[<>&]/g, '');
  return `<div class="progress"><div class="progress-bar"><span style="width:${pct}%"></span></div><small>${pct} % — ${safe}</small></div>`;
}

/** Progression du téléchargement / chargement du modèle WebLLM. */
function onLocalProgress(p) {
  state.localProgress = p.progress >= 1 ? null : p;
  updateBanner();
  const box = $('#localProgress');
  box.hidden = !state.localProgress;
  if (state.localProgress) {
    box.querySelector('.progress-bar span').style.width = `${Math.round(p.progress * 100)}%`;
    box.querySelector('small').textContent = p.text;
  }
  updateSettingsStatus();
}

/* ==========================================================================
   Paramètres
   ========================================================================== */
function openSettings() {
  fillSettings();
  el.settings.showModal();
}

function fillSettings() {
  const s = state.settings;
  const provider = PROVIDERS[s.provider];

  $('#setProvider').innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => {
      const free = FREE_PROVIDERS.includes(id) ? ' — offre gratuite ✓' : '';
      return `<option value="${id}" ${id === s.provider ? 'selected' : ''}>${p.label}${free}</option>`;
    })
    .join('');

  // Liste des modèles : ceux par défaut + ceux récupérés via l'API + « Autre… »
  const current = expertModel();
  const fetched = s.fetchedModels?.[s.provider] || [];
  const known = new Map(provider.models.map((m) => [m.id, m.label]));
  fetched.forEach((id) => known.has(id) || known.set(id, id));
  const isCustom = !known.has(current);
  const sel = $('#setModel');
  sel.innerHTML = '';
  for (const [id, label] of known) sel.add(new Option(label === id ? id : `${label} — ${id}`, id, false, id === current));
  sel.add(new Option('✏️ Autre (ID personnalisé)…', '__custom__', false, isCustom));
  $('#customModelField').hidden = !isCustom;
  $('#setCustomModel').value = isCustom ? current : '';

  $('#setApiKey').value = s.apiKeys[s.provider] || '';
  $('#setApiKey').placeholder = provider.keyHint;
  $('#keyLink').href = provider.keyUrl;
  $('#setProxy').value = s.proxyUrl;

  $('#setLocalModel').innerHTML = LOCAL_MODELS
    .map((m) => `<option value="${m.id}" ${m.id === s.localModel ? 'selected' : ''}>${m.label}</option>`)
    .join('');

  $('#setRag').checked = s.ragEnabled;
  updateSettingsStatus();
}

function updateSettingsStatus() {
  const gpu = $('#webgpuStatus');
  if (state.webgpu === null) {
    gpu.className = 'status-line';
    gpu.textContent = 'Vérification de WebGPU…';
  } else if (state.webgpu.ok) {
    gpu.className = 'status-line ok';
    gpu.textContent = local.isLoaded(state.settings.localModel)
      ? '✓ WebGPU disponible — modèle chargé et prêt.'
      : '✓ WebGPU disponible sur ce navigateur.';
  } else {
    gpu.className = 'status-line bad';
    gpu.textContent = `✗ ${state.webgpu.reason} Essaie Chrome / Edge récent ou Safari récent.`;
  }
  $('#loadLocal').disabled = !state.webgpu?.ok || !!state.localProgress;

  const rag = $('#ragStatus');
  rag.className = 'status-line' + (ragState.status === 'ready' ? ' ok' : ragState.status === 'error' ? ' bad' : '');
  rag.textContent = state.settings.ragEnabled ? ragState.message || 'En attente…' : 'Désactivé.';
}

function showKeyNotice(text) {
  const n = $('#keyNotice');
  n.textContent = text;
  n.hidden = false;
}

/**
 * Corrige les clés enregistrées sous le mauvais fournisseur
 * (ex. clé OpenRouter collée alors que Groq était sélectionné).
 */
function fixMisplacedKeys() {
  const s = state.settings;
  let changed = false;
  for (const [providerId, key] of Object.entries(s.apiKeys)) {
    const detected = detectProvider(key);
    if (!detected || detected === providerId || s.apiKeys[detected]) continue;
    s.apiKeys[detected] = key;
    delete s.apiKeys[providerId];
    if (s.provider === providerId) s.provider = detected;
    changed = true;
  }
  if (changed) saveSettings(s);
}

function bindSettings() {
  const s = state.settings;

  $('#setProvider').addEventListener('change', (e) => {
    s.provider = e.target.value;
    persistSettings();
    fillSettings();
  });

  $('#setModel').addEventListener('change', (e) => {
    const custom = e.target.value === '__custom__';
    $('#customModelField').hidden = !custom;
    if (custom) {
      $('#setCustomModel').focus();
    } else {
      s.models[s.provider] = e.target.value;
      persistSettings();
    }
  });

  $('#setCustomModel').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (v) s.models[s.provider] = v;
    else delete s.models[s.provider];
    persistSettings();
  });

  $('#setApiKey').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const detected = v && detectProvider(v);
    $('#keyNotice').hidden = true;

    // Clé d'un autre fournisseur : on bascule automatiquement sur le bon
    if (detected && detected !== s.provider) {
      delete s.apiKeys[s.provider];
      s.apiKeys[detected] = v;
      s.provider = detected;
      persistSettings();
      fillSettings();
      showKeyNotice(`✓ Clé ${PROVIDERS[detected].label} reconnue : le fournisseur a été changé automatiquement.`);
      return;
    }

    if (v) s.apiKeys[s.provider] = v;
    else delete s.apiKeys[s.provider];
    persistSettings();
  });

  $('#toggleKey').addEventListener('click', () => {
    const input = $('#setApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#setProxy').addEventListener('change', (e) => {
    s.proxyUrl = e.target.value.trim();
    persistSettings();
  });

  $('#refreshModels').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const apiKey = s.apiKeys[s.provider];
    if (!apiKey) return alert('Ajoute d\'abord ta clé API pour récupérer la liste des modèles.');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const ids = await expert.listModels({ providerId: s.provider, apiKey, proxyUrl: s.proxyUrl });
      s.fetchedModels = { ...(s.fetchedModels || {}), [s.provider]: ids };
      persistSettings();
      fillSettings();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '↻ Actualiser';
    }
  });

  $('#setLocalModel').addEventListener('change', (e) => {
    s.localModel = e.target.value;
    persistSettings();
    updateSettingsStatus();
  });

  $('#loadLocal').addEventListener('click', async () => {
    try {
      onLocalProgress({ progress: 0, text: 'Initialisation…' });
      await local.loadModel(s.localModel, onLocalProgress);
    } catch (err) {
      alert(`Impossible de charger le modèle local : ${err.message}`);
    } finally {
      state.localProgress = null;
      $('#localProgress').hidden = true;
      updateBanner();
      updateSettingsStatus();
    }
  });

  $('#setRag').addEventListener('change', (e) => {
    s.ragEnabled = e.target.checked;
    persistSettings();
    if (s.ragEnabled) buildIndex();
    updateRagBadge();
    updateSettingsStatus();
  });

  $('#reindex').addEventListener('click', async () => {
    await clearCache();
    buildIndex({ force: true });
  });

  $('#clearHistory').addEventListener('click', () => {
    if (!confirm('Effacer définitivement tout l\'historique des conversations ?')) return;
    clearConversations();
    state.conversations = [];
    state.currentId = null;
    renderSidebar();
    renderMessages();
  });

  $('#clearKeys').addEventListener('click', () => {
    if (!confirm('Effacer toutes les clés API enregistrées dans ce navigateur ?')) return;
    s.apiKeys = {};
    persistSettings();
    fillSettings();
  });

  // Fermer en cliquant hors de la fenêtre
  el.settings.addEventListener('click', (e) => {
    if (e.target === el.settings) el.settings.close();
  });
}

/* ==========================================================================
   RAG : indicateur d'état
   ========================================================================== */
function updateRagBadge() {
  const b = el.ragBadge;
  if (!state.settings.ragEnabled) {
    b.className = 'rag-badge';
    b.textContent = 'Base de connaissances désactivée';
    return;
  }
  b.className = `rag-badge ${ragState.status}`;
  b.textContent = ragState.status === 'ready'
    ? `RAG : ${ragState.files} doc(s), ${ragState.chunks.length} passages`
    : ragState.message || 'RAG en attente';
}

/* ==========================================================================
   Saisie
   ========================================================================== */
function autoResize() {
  el.input.style.height = 'auto';
  el.input.style.height = `${Math.min(el.input.scrollHeight, 220)}px`;
}

function bindComposer() {
  el.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.abort) state.abort.abort(); // bouton « Stop »
    else sendMessage(el.input.value);
  });
  el.input.addEventListener('input', autoResize);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });
}

/* ==========================================================================
   Initialisation
   ========================================================================== */
function init() {
  fixMisplacedKeys();
  renderSuggestions();
  renderSidebar();
  renderMessages();
  updateTopbar();
  updateBanner();
  bindComposer();
  bindSettings();

  document.querySelectorAll('.mode-switch button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  $('#newChat').addEventListener('click', newConversation);
  $('#openSettings').addEventListener('click', openSettings);
  el.modelBadge.addEventListener('click', openSettings);
  $('#toggleSidebar').addEventListener('click', openSidebar);
  el.backdrop.addEventListener('click', closeSidebar);

  // Détection de WebGPU (en arrière-plan)
  local.checkWebGPU().then((r) => {
    state.webgpu = r;
    updateBanner();
    updateSettingsStatus();
  });

  // Indexation des documents, une fois la page affichée
  onRagChange(() => {
    updateRagBadge();
    if (el.settings.open) updateSettingsStatus();
  });
  updateRagBadge();
  if (state.settings.ragEnabled) setTimeout(() => buildIndex(), 800);

  el.input.focus();
}

init();
