/* Vorschaubilder für den Katalog: rendert jedes Modell aus katalog/katalog.json schräg von vorn (WebKit + three.js)
 * nach katalog/vorschau/<id>.png (240 × 240, durchsichtig). Optional: ids als Argumente.
 * Mit --blatt <datei.png> zusätzlich ein Übersichtsblatt aller Bilder (zum Prüfen der Vorderseiten). */
import { webkit } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5193, basis = `http://localhost:${PORT}/`;
const args = process.argv.slice(2), blattIdx = args.indexOf('--blatt');
const blatt = blattIdx >= 0 ? args.splice(blattIdx, 2)[1] : null;
const { modelle } = JSON.parse(await readFile(root + 'katalog/katalog.json', 'utf8'));
const liste = modelle.filter(m => !args.length || args.includes(m.id));

const server = spawn(process.execPath, [root + 'scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' } });
await new Promise(ok => server.stdout.once('data', ok));
await mkdir(root + 'katalog/vorschau', { recursive: true });
const browser = await webkit.launch();
try {
  const page = await browser.newPage({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 1 });
  await page.goto(basis + 'scripts/vorschau.html');
  await page.waitForFunction(() => window.zeige);
  for (const m of liste) {
    await page.evaluate(d => window.zeige(d), m.datei);
    await page.screenshot({ path: `${root}${m.vorschau}`, omitBackground: true });
    console.log(m.vorschau);
  }
  if (blatt) {
    const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await p2.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(6,200px);font:12px sans-serif">${modelle.map(m =>
      `<div><img src="${basis}${m.vorschau}" width=200 height=200 style="background:#eee"><div>${m.id}</div></div>`).join('')}</body>`);
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: blatt, fullPage: true });
  }
} finally {
  await browser.close();
  server.kill();
}
