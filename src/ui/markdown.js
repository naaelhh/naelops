/**
 * markdown.js — Rendu Markdown sécurisé + coloration syntaxique
 * --------------------------------------------------------------
 * marked     : Markdown → HTML
 * DOMPurify  : nettoie le HTML (protection XSS, la réponse vient d'une IA)
 * highlight.js : coloration des blocs de code + bouton « Copier »
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';
import apache from 'highlight.js/lib/languages/apache';

// Langages utiles en sysadmin absents du pack « common »
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('apache', apache);
// Alias pratiques : les configs Cisco/pfSense n'ont pas de grammaire dédiée
hljs.registerAliases(['ps1', 'pwsh'], { languageName: 'powershell' });
hljs.registerAliases(['cisco', 'ios', 'conf', 'cfg'], { languageName: 'ini' });

marked.setOptions({ gfm: true, breaks: false });

/**
 * Affiche du Markdown dans un élément.
 * Appelée à chaque token pendant le streaming : doit rester rapide.
 */
export function renderMarkdown(el, text) {
  const html = marked.parse(text || '');
  el.innerHTML = DOMPurify.sanitize(html);
  enhanceCodeBlocks(el);
  // Les liens s'ouvrent dans un nouvel onglet
  el.querySelectorAll('a[href]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
}

/** Ajoute coloration + barre d'en-tête (langage, bouton Copier) à chaque bloc. */
function enhanceCodeBlocks(root) {
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    const lang = (code.className.match(/language-([\w-]+)/) || [])[1];

    if (lang && hljs.getLanguage(lang)) {
      code.innerHTML = hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true }).value;
    } else {
      code.innerHTML = hljs.highlightAuto(code.textContent).value;
    }
    code.classList.add('hljs');

    const header = document.createElement('div');
    header.className = 'code-header';
    const label = document.createElement('span');
    label.textContent = lang || 'code';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copier';
    btn.addEventListener('click', () => copyText(code.textContent, btn));
    header.append(label, btn);

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.append(header, pre);
  });
}

/** Copie dans le presse-papiers, avec repli pour les contextes non sécurisés. */
export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copié ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove('copied');
    }, 1500);
  }
}
