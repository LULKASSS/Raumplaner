/* Lokaler Server für die Entwicklung, auch im WLAN erreichbar (fürs iPhone): http://<Mac-Adresse>:5190
 * Später kommt hier der IKEA-Durchreicher dazu (nur ikea.com, speichert nichts). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = +(process.env.PORT || 5190);
const host = process.env.HOST || '0.0.0.0';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.usdz': 'model/vnd.usdz+zip'
};
// Nie ausliefern: echte Proben, Abhängigkeiten, Git
const gesperrt = ['node_modules', 'proben', '.git'].map(d => sep + d + sep);

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || gesperrt.some(d => (file + sep).includes(d))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('nicht gefunden');
  }
}).listen(port, host, () => {
  console.log(`Raumplaner läuft auf http://localhost:${port}`);
  if (host === '0.0.0.0') {
    for (const liste of Object.values(networkInterfaces()))
      for (const a of liste || []) if (a.family === 'IPv4' && !a.internal) console.log(`Im WLAN (iPhone):  http://${a.address}:${port}`);
  }
});
