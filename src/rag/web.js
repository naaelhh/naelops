/**
 * web.js — Recherche d'informations sur Internet (sources gratuites, sans clé)
 * ----------------------------------------------------------------------------
 * Interrogées directement depuis le navigateur (CORS ouvert) :
 *  - endoflife.date : dernières versions et fins de support de ~500 logiciels
 *  - CVE (cve.org)  : fiche officielle d'une faille citée par son identifiant
 *  - NVD (NIST)     : failles récentes d'un produit (120 derniers jours)
 *  - Wikipédia      : contexte général (FR, puis EN si rien trouvé)
 *
 * Les résultats sont injectés dans le prompt, comme les passages du RAG,
 * et affichés sous la réponse avec leurs liens.
 */

const TIMEOUT = 8000;
const MAX_TEXT = 1500;

/** Noms courants → identifiant endoflife.date (complète la détection automatique). */
const PRODUCT_ALIASES = {
  proxmox: 'proxmox-ve',
  pve: 'proxmox-ve',
  'proxmox backup': 'proxmox-backup-server',
  pbs: 'proxmox-backup-server',
  'windows server': 'windows-server',
  apache: 'apache-http-server',
  docker: 'docker-engine',
  exchange: 'msexchange',
  'sql server': 'mssqlserver',
  postgres: 'postgresql',
  veeam: 'veeam-backup-and-replication',
  'ios xe': 'cisco-ios-xe',
  'ios-xe': 'cisco-ios-xe',
  vmware: 'esxi',
  'red hat': 'rhel',
  redhat: 'rhel',
  rocky: 'rocky-linux',
  alma: 'almalinux',
  k8s: 'kubernetes',
  fortigate: 'fortios',
  powershell: 'windows-powershell',
};

/** Mots indiquant une question de sécurité (→ recherche de failles récentes). */
const SECURITY_WORDS = /\b(faille|failles|vuln|vulnérabilit|vulnerabilit|cve|exploit|sécurité|securite|security|patch|correctif)/i;

/** fetch JSON avec délai maximal : une source lente ne bloque pas les autres. */
async function getJSON(url, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ---------- endoflife.date ---------- */

let productList = null;

/** Produits mentionnés dans la question (2 au maximum, les plus précis d'abord). */
async function detectProducts(question, signal) {
  productList ??= getJSON('https://endoflife.date/api/all.json', signal).catch((err) => {
    productList = null;
    throw err;
  });
  const products = await productList;
  const text = ` ${normalize(question).replace(/[^a-z0-9.]+/g, ' ')} `;
  const found = new Set();

  for (const [alias, slug] of Object.entries(PRODUCT_ALIASES)) {
    if (text.includes(` ${alias.replace(/-/g, ' ')} `)) found.add(slug);
  }
  for (const slug of products) {
    if (text.includes(` ${slug.replace(/-/g, ' ')} `)) found.add(slug);
  }
  // « windows-server » trouvé : inutile de garder aussi « windows »
  const list = [...found].filter((s) => ![...found].some((o) => o !== s && o.startsWith(`${s}-`)));
  return list.sort((a, b) => b.length - a.length).slice(0, 2);
}

async function endOfLife(slug, question, signal) {
  const cycles = await getJSON(`https://endoflife.date/api/${slug}.json`, signal);
  const fmt = (v) => (v === true ? 'oui' : v === false ? 'non' : v ?? '—');
  // Les 4 versions les plus récentes + celles citées dans la question (ex. « Ubuntu 22.04 »)
  const asked = question.match(/\d+(?:\.\d+)*/g) || [];
  const wanted = cycles.filter((c, i) => i < 4 || asked.some((v) => String(c.cycle) === v || String(c.cycle).startsWith(`${v}-`) || String(c.cycle).startsWith(`${v} `)));
  const lines = wanted.slice(0, 8).map((c) =>
    `- Version ${c.cycle}${c.codename ? ` (${c.codename})` : ''}${c.lts ? ' LTS' : ''} : sortie le ${fmt(c.releaseDate)}, ` +
    `dernière mise à jour ${fmt(c.latest)} (${fmt(c.latestReleaseDate)}), fin de support ${fmt(c.support)}, fin de vie ${fmt(c.eol)}`,
  );
  return {
    title: `${slug} — versions et fin de support`,
    url: `https://endoflife.date/${slug}`,
    source: 'endoflife.date',
    text: lines.join('\n'),
  };
}

/* ---------- Failles de sécurité (CVE / NVD) ---------- */

function cvssOf(metrics = {}) {
  const m = metrics.cvssMetricV40?.[0] || metrics.cvssMetricV31?.[0] || metrics.cvssMetricV30?.[0] || metrics.cvssMetricV2?.[0];
  return m ? `${m.cvssData.baseScore} (${m.cvssData.baseSeverity || m.baseSeverity || ''})` : 'non évalué';
}

/** Fiche officielle d'une CVE citée par son identifiant. */
async function cveRecord(id, signal) {
  const data = await getJSON(`https://cveawg.mitre.org/api/cve/${id}`, signal);
  const cna = data.containers?.cna || {};
  const desc = (cna.descriptions || []).find((d) => d.lang?.startsWith('en'))?.value || cna.descriptions?.[0]?.value || '';
  const affected = (cna.affected || [])
    .slice(0, 5)
    .map((a) => `${a.vendor || ''} ${a.product || ''} ${(a.versions || []).map((v) => v.lessThan ? `< ${v.lessThan}` : v.version).slice(0, 3).join(', ')}`.trim());
  const score = (cna.metrics || []).map((m) => m.cvssV4_0 || m.cvssV3_1 || m.cvssV3_0).find(Boolean);
  return {
    title: `${id}${cna.title ? ` — ${cna.title}` : ''}`,
    url: `https://www.cve.org/CVERecord?id=${id}`,
    source: 'cve.org',
    text: [
      `Publiée le ${data.cveMetadata?.datePublished?.slice(0, 10) || '—'}`,
      score ? `Score CVSS : ${score.baseScore} (${score.baseSeverity})` : '',
      affected.length ? `Produits concernés : ${affected.join(' ; ')}` : '',
      desc,
    ].filter(Boolean).join('\n'),
  };
}

/** Failles publiées ces 120 derniers jours pour un produit (base NVD). */
async function recentCves(keyword, signal) {
  const end = new Date();
  const start = new Date(end.getTime() - 119 * 864e5);
  const iso = (d) => d.toISOString().replace('Z', '');
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}` +
    `&pubStartDate=${iso(start)}&pubEndDate=${iso(end)}&resultsPerPage=40`;
  const data = await getJSON(url, signal);
  const items = (data.vulnerabilities || [])
    .map((v) => v.cve)
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 6);
  if (!items.length) return null;
  return {
    title: `Failles récentes « ${keyword} » (NVD, 120 derniers jours)`,
    url: `https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(keyword)}`,
    source: 'NVD',
    text: `${data.totalResults} faille(s) publiée(s) sur la période. Les plus récentes :\n` + items.map((c) => {
      const desc = (c.descriptions.find((d) => d.lang === 'en') || c.descriptions[0])?.value || '';
      return `- ${c.id} (${c.published.slice(0, 10)}, CVSS ${cvssOf(c.metrics)}) : ${desc.slice(0, 220)}`;
    }).join('\n'),
  };
}

/* ---------- Wikipédia ---------- */

async function wikipedia(question, lang, signal) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(question)}` +
    '&gsrlimit=2&prop=extracts|info&exintro=1&explaintext=1&exchars=1200&inprop=url&format=json&origin=*';
  const data = await getJSON(url, signal);
  return Object.values(data.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.extract?.trim())
    .map((p) => ({ title: `${p.title} (Wikipédia ${lang.toUpperCase()})`, url: p.fullurl, source: 'Wikipédia', text: p.extract }));
}

/** Mots-clés de la question pour Wikipédia (sans les mots outils). */
function keywords(question) {
  const stop = new Set('le la les un une des de du d l et ou a à au aux en sur pour par avec dans est sont quoi quel quelle quels quelles comment pourquoi faire fait c ce cet cette ces mon ma mes ton ta tes je tu il on nous vous moi explique expliquer donne donner dis dire derniere dernière version actuelle actuellement aujourd hui recent récent récente récentes'.split(' '));
  return question
    .split(/[^\p{L}\p{N}.+#-]+/u)
    .filter((w) => w.length > 1 && !stop.has(w.toLowerCase()))
    .join(' ');
}

/* ---------- Point d'entrée ---------- */

/**
 * Lance les recherches utiles pour la question, en parallèle.
 * @returns {Promise<Array<{ title, url, source, text }>>} résultats (jamais d'exception)
 */
export async function webSearch(question, signal) {
  const tasks = [];
  const cveIds = [...new Set((question.match(/CVE-\d{4}-\d{4,}/gi) || []).map((s) => s.toUpperCase()))].slice(0, 3);
  cveIds.forEach((id) => tasks.push(cveRecord(id, signal)));

  const products = await detectProducts(question, signal).catch(() => []);
  products.forEach((slug) => tasks.push(endOfLife(slug, question, signal)));
  if (SECURITY_WORDS.test(question) && products.length && !cveIds.length) {
    tasks.push(recentCves(products[0].replace(/-(ve|engine|http-server)$/, '').replace(/-/g, ' '), signal));
  }

  // Wikipédia : 1 seul article si une source spécialisée a déjà répondu (moins de hors-sujet)
  const kw = keywords(question);
  if (kw) {
    const limit = products.length || cveIds.length ? 1 : 2;
    tasks.push(
      wikipedia(kw, 'fr', signal)
        .then((r) => (r.length ? r : wikipedia(kw, 'en', signal)))
        .then((r) => r.slice(0, limit)),
    );
  }

  const settled = await Promise.allSettled(tasks);
  settled.filter((s) => s.status === 'rejected').forEach((s) => console.warn('[Web]', s.reason?.message || s.reason));
  return settled.flatMap((s) => (s.status === 'fulfilled' && s.value ? [s.value].flat() : []));
}

/** Met en forme les résultats pour le prompt système. */
export function formatWebContext(results, maxText = MAX_TEXT) {
  if (!results.length) return '';
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const blocks = results.map((r, i) => `[W${i + 1}] ${r.title} — ${r.url}\n${r.text.slice(0, maxText)}`);
  return `\n\n---\nRésultats de recherche sur Internet (effectuée le ${today}). Ils sont plus récents que tes connaissances : ` +
    `utilise-les en priorité pour les versions, dates et failles, et cite les liens utilisés sous la forme [titre](url) :\n\n` +
    `${blocks.join('\n\n')}\n---`;
}
