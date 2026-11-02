# Proxy CORS NaelOps (Cloudflare Worker)

> **En as-tu besoin ?** Probablement pas : lors des tests (novembre 2026), Anthropic, OpenAI,
> Mistral et Groq acceptaient tous les appels directs depuis le navigateur.
> Ce proxy est un **plan B** si un fournisseur se met à bloquer les requêtes (erreur
> « Impossible de joindre … (problème réseau ou CORS) » dans NaelOps).

Le Worker ne stocke aucune clé : il relaie simplement la requête (avec ta clé) vers le
fournisseur et ajoute les en-têtes CORS. Il ne peut joindre que les 4 API connues.
L'offre gratuite de Cloudflare (100 000 requêtes/jour) suffit largement.

## Déploiement — méthode 1 : depuis le navigateur (sans rien installer)

1. Crée un compte gratuit sur <https://dash.cloudflare.com/sign-up>.
2. Menu **Compute (Workers) → Workers & Pages → Create → Create Worker**.
3. Nomme-le `naelops-proxy`, clique **Deploy**, puis **Edit code**.
4. Remplace tout le code par le contenu de [`src/index.js`](src/index.js), puis **Deploy**.
5. Onglet **Settings → Variables and Secrets → Add** :
   - Type : *Text* — Nom : `ALLOWED_ORIGINS`
   - Valeur : `https://naaelhh.github.io` (ton site GitHub Pages, sans `/nom-du-depot`)
6. Copie l'URL du Worker (ex. `https://naelops-proxy.ton-compte.workers.dev`).
7. Dans NaelOps : **⚙️ Paramètres → URL du proxy Cloudflare Worker** → colle l'URL.

## Déploiement — méthode 2 : en ligne de commande (wrangler)

```bash
cd worker
# Modifie ALLOWED_ORIGINS dans wrangler.toml avec l'URL de ton site
npx wrangler login
npx wrangler deploy
```

## Tester

```bash
curl -i -X OPTIONS https://naelops-proxy.ton-compte.workers.dev/groq/models \
  -H "Origin: https://naaelhh.github.io"
# → HTTP 204 + Access-Control-Allow-Origin
```

## Routes

| Préfixe        | Destination                        |
|----------------|------------------------------------|
| `/anthropic/…` | `https://api.anthropic.com/v1/…`   |
| `/openai/…`    | `https://api.openai.com/v1/…`      |
| `/mistral/…`   | `https://api.mistral.ai/v1/…`      |
| `/groq/…`      | `https://api.groq.com/openai/v1/…` |
