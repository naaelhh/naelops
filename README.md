# NaelOps — assistant IA pour l'informatique

NaelOps est un assistant IA spécialisé en **administration systèmes et réseaux** : Linux,
Windows Server, Active Directory, Cisco IOS, pfSense, Proxmox, Hyper-V, Zabbix, GLPI, Bash,
PowerShell. Il couvre aussi le reste de l'IT (cloud, cybersécurité, DevOps, bases de données).

Le site est **100 % statique**, hébergé gratuitement sur **GitHub Pages**. Il n'y a ni serveur
ni base de données, et **aucune clé API dans le code**.

## Fonctionnalités

| | |
|---|---|
| ⚡ **Mode Expert (API)** | Gros modèle via l'API d'**Anthropic (Claude)**, d'**OpenAI**, de **Mistral**, de **Groq**, de **Google Gemini** ou d'**OpenRouter**, avec ta propre clé (4 d'entre eux ont une offre gratuite) |
| 💻 **Mode Local (navigateur)** | Petit modèle (Qwen2.5 / Llama 3.2) exécuté **dans le navigateur** avec WebLLM + WebGPU. Gratuit et hors ligne après le premier chargement |
| 📚 **RAG** | Les réponses s'appuient sur **tes propres documents Markdown** (`/docs`) et citent la source |
| 📎 **Documents joints** | Joins un **PDF, Word (.docx), log, config ou script** à ta question (bouton 📎, glisser-déposer ou Ctrl+V) |
| 🌐 **Recherche Internet** | Bouton 🌐 : dernières versions et fins de support, failles CVE récentes, Wikipédia — gratuit, sans clé |
| 📁 **Base perso privée** | Importe tes propres documents : ils restent **dans ton navigateur** (jamais publiés) et servent à toutes tes questions |
| 💬 **Chat moderne** | Streaming mot par mot, Markdown, coloration syntaxique, bouton « Copier » sur chaque bloc de code |
| 🗂 **Historique** | Conversations sauvegardées dans le navigateur (localStorage) et listées dans la barre latérale |
| 📱 **Responsive** | Mode sombre, utilisable sur PC et sur mobile |

## Architecture

```
naelops/
├── index.html                  # page unique (chat + fenêtre Paramètres)
├── src/
│   ├── main.js                 # logique de l'interface (chat, historique, paramètres)
│   ├── config.js               # prompt système, fournisseurs, modèles, suggestions
│   ├── storage.js              # localStorage (paramètres + conversations)
│   ├── styles.css              # thème sombre
│   ├── ui/markdown.js          # Markdown + coloration + bouton Copier
│   ├── providers/
│   │   ├── expert.js           # API Anthropic / compatibles OpenAI (streaming SSE, erreurs)
│   │   ├── local.js            # WebLLM (détection WebGPU, chargement, streaming)
│   │   └── webllm.worker.js    # WebLLM dans un Web Worker
│   └── rag/
│       ├── rag.js              # découpage, index, recherche hybride, docs perso, IndexedDB
│       ├── extract.js          # lecture du texte des PDF / Word / fichiers texte
│       ├── web.js              # recherche Internet (endoflife.date, CVE, NVD, Wikipédia)
│       └── embed.worker.js     # embeddings transformers.js (Web Worker)
├── docs/                       # ← TES documents Markdown (base de connaissances)
├── scripts/build-docs-index.js # génère public/docs/index.json au build
├── worker/                     # proxy CORS Cloudflare (optionnel)
└── .github/workflows/deploy.yml# déploiement automatique sur GitHub Pages
```

### Fonctionnement d'une question

```
Question ──► RAG : embedding de la question (transformers.js, dans le navigateur)
             └─► 3-5 passages les plus proches dans /docs (similarité + mots-clés)
         ──► prompt système NaelOps + passages trouvés + historique
         ──► Mode Expert : API du fournisseur (directe, ou via le proxy)
             Mode Local  : WebLLM sur le GPU de l'ordinateur
         ──► réponse en streaming + sources affichées sous la réponse
```

- **Embeddings** : `Xenova/multilingual-e5-small` (≈ 120 Mo, multilingue). Il est téléchargé
  au premier lancement puis mis en cache par le navigateur. Les vecteurs des documents sont
  stockés dans **IndexedDB** et ne sont recalculés que si un document change.
- **Recherche hybride** : similarité cosinus et petit bonus pour les mots de la question présents
  tels quels dans le passage. Un seuil filtre les passages hors sujet.

## Lancer en local

Il faut **Node.js 20 ou plus récent** (<https://nodejs.org>, version LTS).

```bash
npm install
npm run dev
```

Ouvre ensuite <http://localhost:5173>.

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement avec rechargement automatique |
| `npm run build` | construit le site dans `dist/` |
| `npm run preview` | sert le contenu de `dist/` pour le tester |
| `npm run docs` | régénère seulement l'index des documents |

## Obtenir une clé API

La clé se colle dans **⚙️ Paramètres → Clé API**. Elle est stockée **uniquement dans le
localStorage de ton navigateur** et n'est envoyée qu'au fournisseur (ou à ton proxy).
⚠️ **N'utilise jamais ta clé sur un ordinateur partagé.**

| Fournisseur | Où créer la clé | Gratuit ? |
|---|---|---|
| **Groq** (conseillé pour démarrer) | <https://console.groq.com/keys> | ✅ offre gratuite avec limites de débit, sans carte bancaire |
| **Google Gemini** | <https://aistudio.google.com/apikey> | ✅ offre gratuite avec un compte Google (limites de débit ; les requêtes gratuites peuvent servir à améliorer les produits Google) |
| **OpenRouter** | <https://openrouter.ai/settings/keys> | ✅ modèles `:free` et routeur `openrouter/free` (20 requêtes/min, 50/jour sans achat de crédit) |
| **Mistral** | <https://console.mistral.ai/api-keys> | ✅ formule gratuite « Experiment » (limites de débit, vérification par téléphone) |
| **Anthropic (Claude)** | <https://console.anthropic.com/settings/keys> | ❌ payant (crédit prépayé) |
| **OpenAI** | <https://platform.openai.com/api-keys> | ❌ payant (crédit prépayé) |

Étapes types (Groq) : crée un compte, va dans **API Keys**, clique **Create API Key**, copie la
clé (`gsk_…`) et colle-la dans NaelOps.

> 💡 Le bouton **↻ Actualiser** des Paramètres récupère la liste des modèles disponibles
> pour ta clé. Les noms de modèles évoluent souvent ; l'option **« Autre (ID personnalisé) »**
> permet d'en saisir un à la main.

### Et si un fournisseur bloque les appels (CORS) ?

Lors des tests, les 6 fournisseurs acceptaient les appels directs depuis le navigateur. Si
l'un d'eux les bloque un jour, déploie le petit proxy gratuit fourni dans
[`worker/`](worker/README.md) et colle son URL dans les Paramètres.

## Mode Local (navigateur)

- Il faut un navigateur compatible **WebGPU** : Chrome ou Edge récents (PC, Mac, Android),
  Safari récent (macOS / iOS 26+). Firefox ne l'active pas encore partout.
- Au premier usage, le modèle est téléchargé (1 à 2 Go selon le modèle) avec une barre de
  progression. Il est ensuite **mis en cache** et fonctionne **hors ligne**.
- Ce mode est **moins précis** que le mode Expert. Il sert de secours (pas de clé, pas de réseau).
- Si WebGPU n'est pas disponible, NaelOps l'indique et propose de passer en mode Expert.

## Ajouter des documents à la base de connaissances (RAG)

1. Ajoute tes fichiers **Markdown** (`.md`) dans le dossier `docs/`. Les sous-dossiers sont
   acceptés, par exemple `docs/reseau/pfsense-dmz.md`.
2. Commence chaque fichier par un titre `# …` et structure-le avec des titres `##` : le
   découpage se fait par section, donc des sections claires donnent de meilleurs résultats.
3. Fais un commit et un push. Le workflow régénère l'index et redéploie le site
   automatiquement. En local, relance `npm run dev`.
4. Au chargement suivant, seuls les documents nouveaux ou modifiés sont réindexés.

Conseils :
- Une procédure par fichier, avec des titres explicites (« Créer un VLAN », « Sauvegarde »…).
- Mets les commandes dans des blocs de code avec le langage (```` ```bash ````, ```` ```powershell ````…).
- ⚠️ Le site est **public** : n'y mets **ni mots de passe, ni IP publiques sensibles, ni données
  clients**.

Le RAG peut être désactivé dans **⚙️ Paramètres → Base de connaissances**.

## Recherche sur Internet (bouton 🌐)

Active le bouton 🌐 à gauche de la zone de saisie pour que NaelOps cherche des informations **à jour** avant de répondre. Les liens consultés s'affichent sous la réponse.

| Source | Quand | Exemple de question |
|---|---|---|
| [endoflife.date](https://endoflife.date) | Un logiciel est cité (≈ 500 produits : Ubuntu, Debian, Windows Server, Proxmox, PHP, Zabbix…) | « Ubuntu 22.04 est encore supporté ? » |
| [cve.org](https://www.cve.org) | Une faille est citée par son identifiant | « Explique-moi la CVE-2024-3094 » |
| [NVD](https://nvd.nist.gov) | Question de sécurité sur un produit (failles des 120 derniers jours) | « Y a-t-il des failles récentes sur Proxmox ? » |
| [Wikipédia](https://fr.wikipedia.org) | Toujours (FR, puis EN) | « C'est quoi le protocole OSPF ? » |

- Gratuit et sans clé : les requêtes partent directement de ton navigateur vers ces sites.
- Ce n'est pas un moteur de recherche généraliste (pas de forums ni de blogs) : les fournisseurs d'IA facturent la vraie recherche web (Gemini « Grounding with Google Search » n'est pas inclus dans l'offre gratuite, et Groq Compound a été arrêté en septembre 2026).
- La date du jour est toujours donnée au modèle, pour qu'il sache que ses connaissances peuvent être dépassées.

## Documents joints et base perso (privée)

Deux façons de donner tes propres documents à NaelOps, sans rien publier sur GitHub :

| | Comment | Usage |
|---|---|---|
| 📎 **Joindre à une question** | Bouton 📎 à gauche de la zone de saisie, glisser-déposer, ou Ctrl+V d'un fichier | « Trouve l'erreur dans ce log », « Résume ce cours », « Explique cette config » |
| 📁 **Base perso** | Bouton **📚 Garder dans ma base** sur une pièce jointe, ou **⚙️ Paramètres → Mes documents perso → Importer** | Le document sert ensuite à **toutes** tes questions, comme les mémos de `/docs` |

- Formats lus : **PDF** (avec du texte, pas les scans), **Word .docx**, et tout fichier texte (`.txt`, `.md`, `.log`, `.conf`, `.yaml`, `.ps1`, `.sh`, `.csv`…). Max 25 Mo par fichier.
- La lecture se fait **dans le navigateur** (pdf.js, mammoth). La base perso est stockée dans **IndexedDB** sur cet appareil : elle n'est pas synchronisée entre ton PC et ton téléphone.
- ⚠️ En mode Expert, le contenu des documents utiles est **envoyé au fournisseur d'IA** avec ta question. En mode Local, rien ne quitte l'ordinateur.
- Les documents perso apparaissent en orange (📁) dans les sources des réponses.

## Déployer sur GitHub Pages — pas à pas

### 1. Prérequis (une seule fois)

```bash
# Ubuntu / Debian
sudo apt install git nodejs npm
git config --global user.name "Ton Nom"
git config --global user.email "ton@email.fr"
```

Crée un compte sur <https://github.com> si ce n'est pas déjà fait.

### 2. Créer le dépôt sur GitHub

1. Sur GitHub, clique **+ → New repository**.
2. Nom : `naelops`. Visibilité : **Public** (GitHub Pages gratuit l'exige pour un compte gratuit).
3. **Ne coche pas** « Add a README » : le dépôt doit être vide.
4. Clique **Create repository**.

### 3. Pousser le code

Dans le dossier du projet :

```bash
git init -b main
git add .
git commit -m "Première version de NaelOps"
git remote add origin https://github.com/naaelhh/naelops.git
git push -u origin main
```

> GitHub ne demande plus le mot de passe du compte lors du push. Utilise un **token** (Settings →
> Developer settings → Personal access tokens), ou plus simplement
> [GitHub CLI](https://cli.github.com) : `gh auth login`.

### 4. Activer GitHub Pages

1. Sur la page du dépôt : **Settings → Pages**.
2. Dans **Build and deployment → Source**, choisis **GitHub Actions**.
3. Onglet **Actions** : le workflow « Déployer sur GitHub Pages » se lance (s'il a échoué avant
   l'activation de Pages, clique **Re-run all jobs**).
4. Après 1 à 2 minutes, le site est en ligne sur
   **`https://naaelhh.github.io/naelops/`**.

Chaque `git push` sur `main` redéploie ensuite le site automatiquement.

## Sécurité et confidentialité

- Aucune clé dans le dépôt : chaque utilisateur saisit la sienne, qui reste dans son navigateur.
- Les réponses de l'IA sont nettoyées (DOMPurify) avant affichage.
- Les conversations restent dans le navigateur. Le bouton **Effacer l'historique** des
  Paramètres les supprime.
- En mode Expert, tes questions et les extraits de docs utilisés sont envoyés au fournisseur
  choisi. En mode Local, rien ne quitte ton ordinateur.

## Technologies

[Vite](https://vite.dev) · [WebLLM](https://github.com/mlc-ai/web-llm) ·
[transformers.js](https://github.com/huggingface/transformers.js) · [marked](https://marked.js.org) ·
[highlight.js](https://highlightjs.org) · [pdf.js](https://mozilla.github.io/pdf.js/) · [mammoth](https://github.com/mwilliamson/mammoth.js) · [DOMPurify](https://github.com/cure53/DOMPurify) ·
[Cloudflare Workers](https://workers.cloudflare.com)
