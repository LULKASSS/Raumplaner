/* Erzeugt icon-180.png und icon-512.png aus icon.svg (mit dem WebKit aus Playwright). */
import { webkit } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(root + 'icon.svg', 'utf8');
const browser = await webkit.launch();
for (const groesse of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: groesse, height: groesse } });
  // iOS rundet die Ecken selbst: Fläche ohne eigene Rundung
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${groesse}px;height:${groesse}px}</style>${svg.replace('rx="112"', 'rx="0"')}`);
  await page.screenshot({ path: `${root}icon-${groesse}.png` });
}
await browser.close();
console.log('icon-180.png und icon-512.png geschrieben');
