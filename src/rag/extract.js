/**
 * extract.js — Lecture du texte des documents, 100 % dans le navigateur
 * ----------------------------------------------------------------------
 * - PDF  : pdf.js (pdfjs-dist)
 * - Word : mammoth (.docx)
 * - Texte : tout fichier lisible (txt, md, log, conf, yaml, ps1, sh, csv…)
 *
 * Les bibliothèques PDF / Word ne sont chargées qu'au premier besoin.
 * Aucun fichier n'est envoyé sur Internet par cette étape.
 */

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo

/** Extensions proposées dans le sélecteur de fichiers. */
export const ACCEPTED = [
  '.pdf', '.docx', '.txt', '.md', '.log', '.conf', '.cfg', '.ini', '.yaml', '.yml', '.json',
  '.xml', '.csv', '.ps1', '.psm1', '.sh', '.bash', '.py', '.js', '.ts', '.sql', '.toml', '.html',
  '.htm', '.css', '.bat', '.cmd', '.vbs', '.tf', '.j2', '.service', '.rules',
].join(',');

/**
 * Extrait le texte d'un fichier.
 * @param {File} file
 * @returns {Promise<{ name: string, text: string }>}
 */
export async function extractText(file) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`${file.name} est trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo).`);
  }
  const ext = file.name.toLowerCase().split('.').pop();

  let text;
  if (ext === 'pdf' || file.type === 'application/pdf') text = await readPdf(file);
  else if (ext === 'docx') text = await readDocx(file);
  else if (ext === 'doc') throw new Error(`${file.name} : l'ancien format .doc n'est pas pris en charge. Enregistre-le en .docx ou en PDF.`);
  else text = await readPlainText(file);

  text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) {
    throw new Error(`${file.name} : aucun texte trouvé (PDF scanné ou image ? Ce type de document n'est pas lisible).`);
  }
  return { name: file.name, text };
}

/** Fichier texte : refuse les fichiers binaires (images, exécutables…). */
async function readPlainText(file) {
  const text = await file.text();
  if (text.slice(0, 4000).includes('\u0000')) {
    throw new Error(`${file.name} n'est pas un fichier texte lisible (formats acceptés : PDF, Word .docx, texte, configs, scripts…).`);
  }
  return text;
}

/** PDF : texte page par page, en conservant les retours à la ligne. */
async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let pageText = '';
    for (const item of content.items) {
      pageText += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(pageText.replace(/[ \t]+\n/g, '\n').trim());
  }
  await task.destroy(); // libère le worker pdf.js
  return pages.filter(Boolean).join('\n\n');
}

/** Word (.docx) : texte brut via mammoth. */
async function readDocx(file) {
  const { default: mammoth } = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}
