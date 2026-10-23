/* Schneller Fehlercheck ohne Browser:
 * 1. Alle JavaScript-Module sind syntaktisch gültig
 * 2. Keine echten Scans, Modelle oder Schlüssel im Repo (es ist öffentlich)
 * Exit-Code 1 bei Fehlern. */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [], warns = [];

let files = [];
try { files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); }
catch { warns.push('git nicht verfügbar, Datencheck übersprungen'); }

/* 1. Syntax */
const code = files.filter(f => /\.(js|mjs)$/.test(f) && !f.startsWith('vendor/'));
for (const f of code) {
  try { execFileSync(process.execPath, ['--check', root + f], { stdio: 'pipe' }); }
  catch (e) { errors.push(`Syntaxfehler in ${f}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`); }
}

/* 2. Scans, Modelle, Schlüssel */
// Modelle dürfen nur als erfundene Testdaten oder lizenzgeprüfter Katalog ins Repo.
const modellErlaubt = f => f.startsWith('test/daten/') || f.startsWith('katalog/') || f.startsWith('vendor/');
for (const f of files) {
  if (f.startsWith('proben/')) errors.push(`Echte Probe im Repo: ${f} (proben/ bleibt lokal)`);
  if (/\.(usdz|usdc|usda|glb|gltf|obj|ply|reality)$/i.test(f) && !modellErlaubt(f)) errors.push(`Modell außerhalb von test/daten/ oder katalog/: ${f}`);
  if (/\.(pdf|xlsx?|docx?|heic|jpe?g)$/i.test(f) && !modellErlaubt(f)) errors.push(`Dokument oder Foto im Repo: ${f}`);
  if (/\.png$/i.test(f) && !/^icon-\d+\.png$/.test(f)) errors.push(`Bild im Repo: ${f} (nur die App-Symbole gehören hierher)`);
  if (/\.(js|mjs|html|md|json|yml)$/.test(f) && !f.startsWith('vendor/')) {
    const t = await readFile(root + f, 'utf8').catch(() => '');
    if (/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-ant-[A-Za-z0-9-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}/.test(t)) errors.push(`Möglicher Zugangsschlüssel in ${f}`);
  }
}

/* 3. Seite: Grundgerüst, keine doppelten IDs, keine CDNs zur Laufzeit */
const html = await readFile(root + 'index.html', 'utf8');
for (const need of ['<!doctype html>', '<meta charset', 'name="viewport"', '<title>', 'type="importmap"'])
  if (!html.toLowerCase().includes(need.toLowerCase())) errors.push(`index.html: ${need} fehlt`);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
for (const d of new Set(ids.filter((v, i, a) => a.indexOf(v) !== i))) errors.push(`ID doppelt vergeben: #${d}`);
for (const f of ['index.html', ...code.filter(f => f.startsWith('src/'))]) {
  const t = await readFile(root + f, 'utf8');
  if (/https?:\/\/(cdn|unpkg|esm\.sh|cdnjs|jsdelivr|fonts\.googleapis)/.test(t)) errors.push(`CDN zur Laufzeit in ${f} – Bibliotheken gehören nach vendor/`);
}

for (const w of warns) console.log('⚠️  ' + w);
if (errors.length) { console.log('❌ Fehlercheck fehlgeschlagen:'); for (const e of errors) console.log('   • ' + e); process.exit(1); }
console.log(`✅ Fehlercheck ok (${code.length} Module, ${files.length} Dateien geprüft)`);
