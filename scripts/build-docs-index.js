/**
 * build-docs-index.js — Prépare la base de connaissances pour le site statique
 * -----------------------------------------------------------------------------
 * Lancé automatiquement avant `npm run dev` et `npm run build`.
 *  - copie les fichiers Markdown de /docs vers /public/docs
 *  - génère /public/docs/index.json (liste des fichiers + titre + hash)
 *
 * Le hash permet au navigateur de ne recalculer les embeddings
 * que pour les documents modifiés.
 */
import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'docs');
const outDir = join(root, 'public', 'docs');

/** Liste récursivement les fichiers .md (les sous-dossiers sont autorisés). */
async function listMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await listMarkdown(full)));
    else if (e.name.toLowerCase().endsWith('.md')) files.push(full);
  }
  return files.sort();
}

/** Titre = premier titre « # » du fichier, sinon le nom du fichier. */
function extractTitle(content, file) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : basename(file, '.md');
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const files = [];
for (const file of await listMarkdown(srcDir)) {
  const content = await readFile(file, 'utf8');
  const path = relative(srcDir, file).split('\\').join('/');
  await mkdir(dirname(join(outDir, path)), { recursive: true });
  await copyFile(file, join(outDir, path));
  files.push({
    path,
    title: extractTitle(content, file),
    hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
    size: content.length,
  });
}

await writeFile(
  join(outDir, 'index.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2),
);

console.log(`📚 Base de connaissances : ${files.length} document(s) indexé(s) → public/docs/index.json`);
