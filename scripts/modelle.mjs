/* Baut den Katalog mit echten Modellen: lädt die Quellen, richtet jedes Modell aus (Vorderseite nach +Z,
 * Boden bei y = 0, Mitte auf 0/0), bringt es auf echte Größe, komprimiert (Meshopt) und schreibt
 *   katalog/modelle/<id>.glb  und  katalog/katalog.json (Name, Kategorie, Maße, Quelle, Lizenz, Stand).
 * Nur CC0-Quellen. Rohdateien landen in .modelle-cache/ (nicht im Repo).
 *
 *   npm run modelle            alle bauen
 *   npm run modelle -- sofa_02 nur diese
 */
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mkdir, writeFile, readFile, access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CACHE = root + '.modelle-cache/', ZIEL = root + 'katalog/modelle/';
const STAND = new Date().toISOString().slice(0, 10);
const KENNEY_ZIP = 'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip';

// Poly Haven: echte Maße, Vorderseite zeigt im glTF nach +Z (Blender −Y). drehung in Grad um Y, falls nötig.
const POLYHAVEN = [
  ['sofa_02', 'sofa', 'Chesterfield-Sofa'],
  ['Sofa_01', 'sofa', 'Sofa hell'],
  ['modern_arm_chair_01', 'sofa', 'Sessel Leder'],
  ['mid_century_lounge_chair', 'sofa', 'Loungesessel'],
  ['Ottoman_01', 'sofa', 'Hocker Leder'],
  ['modern_coffee_table_01', 'tisch', 'Couchtisch Beton', 90],
  ['coffee_table_round_01', 'tisch', 'Couchtisch rund'],
  ['round_wooden_table_02', 'tisch', 'Esstisch rund'],
  ['WoodenTable_01', 'tisch', 'Holztisch lang'],
  ['metal_office_desk', 'tisch', 'Schreibtisch Metall'],
  ['side_table_01', 'tisch', 'Beistelltisch'],
  ['dining_chair_02', 'stuhl', 'Polsterstuhl'],
  ['drawer_cabinet', 'schrank', 'Kommode offen'],
  ['modern_wooden_cabinet', 'schrank', 'Sideboard Holz'],
  ['steel_frame_shelves_02', 'regal', 'Regal Stahl'],
  ['potted_plant_02', 'sonst', 'Pflanze im Topf']
].map(([id, kategorie, name, drehung = 0]) => ({ id, kategorie, name, drehung, quelle: 'Poly Haven' }));

// Kenney Furniture Kit: Spiel-Maßstab, darum auf übliche echte Maße gestreckt (b × t × h in Metern).
const KENNEY = [
  ['loungeSofa', 'sofa', 'Sofa schlicht', [2.1, 0.92, 0.82]],
  ['loungeChair', 'sofa', 'Sessel schlicht', [0.8, 0.85, 0.8]],
  ['bedDouble', 'bett', 'Doppelbett 160 × 200', [1.66, 2.08, 0.9]],
  ['bedSingle', 'bett', 'Einzelbett 90 × 200', [0.96, 2.08, 0.9]],
  ['table', 'tisch', 'Esstisch schlicht', [1.6, 0.9, 0.75]],
  ['desk', 'tisch', 'Schreibtisch schlicht', [1.4, 0.7, 0.75]],
  ['chair', 'stuhl', 'Stuhl schlicht', [0.45, 0.52, 0.85]],
  ['chairDesk', 'stuhl', 'Bürostuhl', [0.65, 0.65, 1.1]],
  ['bookcaseOpen', 'regal', 'Bücherregal schlicht', [0.8, 0.3, 1.8]],
  ['bookcaseClosedWide', 'schrank', 'Schrank niedrig', [1.2, 0.4, 1.2]],
  ['cabinetTelevision', 'schrank', 'TV-Bank', [1.5, 0.4, 0.5]],
  ['washer', 'sonst', 'Waschmaschine', [0.6, 0.6, 0.85]],
  ['kitchenFridge', 'sonst', 'Kühlschrank', [0.6, 0.65, 1.8]]
].map(([datei, kategorie, name, masse, drehung = 0]) => ({ id: 'kenney-' + datei, datei, kategorie, name, masse, drehung, quelle: 'Kenney' }));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const da = p => access(p).then(() => true, () => false);

async function laden(url, ziel) {
  if (await da(ziel)) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  await writeFile(ziel, Buffer.from(await r.arrayBuffer()));
}

async function polyhavenQuelle(m) {
  const dir = `${CACHE}polyhaven/${m.id}/`;
  await mkdir(dir, { recursive: true });
  const info = await (await fetch(`https://api.polyhaven.com/info/${m.id}`)).json();
  const files = await (await fetch(`https://api.polyhaven.com/files/${m.id}`)).json();
  const g = files.gltf['1k'].gltf;
  await laden(g.url, dir + 'modell.gltf');
  for (const [pfad, f] of Object.entries(g.include || {})) {
    await mkdir(dir + pfad.split('/').slice(0, -1).join('/'), { recursive: true });
    await laden(f.url, dir + pfad);
  }
  return { pfad: dir + 'modell.gltf', autor: Object.keys(info.authors || {}).join(', '), quelleUrl: `https://polyhaven.com/a/${m.id}` };
}

async function kenneyQuelle(m) {
  const zip = CACHE + 'kenney_furniture-kit.zip', dir = CACHE + 'kenney/';
  if (!(await da(dir))) {
    await mkdir(CACHE, { recursive: true });
    await laden(KENNEY_ZIP, zip);
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  return { pfad: `${dir}Models/GLTF format/${m.datei}.glb`, autor: 'Kenney', quelleUrl: 'https://kenney.nl/assets/furniture-kit' };
}

/** Alles unter einen Knoten hängen, drehen, (bei Kenney) strecken, auf den Boden und in die Mitte setzen. */
function ausrichten(doc, m) {
  const szene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const huelle = doc.createNode('moebel'), innen = doc.createNode('modell');
  for (const k of szene.listChildren()) { szene.removeChild(k); innen.addChild(k); }
  huelle.addChild(innen); szene.addChild(huelle);
  const w = m.drehung * Math.PI / 360;
  innen.setRotation([0, Math.sin(w), 0, Math.cos(w)]);
  let b = getBounds(szene);
  if (m.masse) {
    const [zb, zt, zh] = m.masse, d = b.max.map((v, i) => v - b.min[i]);
    huelle.setScale([zb / d[0], zh / d[1], zt / d[2]]);
    b = getBounds(szene);
  }
  const t = huelle.getTranslation();
  huelle.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2]);
  b = getBounds(szene);
  const r = v => Math.round(v * 1000) / 1000;
  return { b: r(b.max[0] - b.min[0]), t: r(b.max[2] - b.min[2]), h: r(b.max[1] - b.min[1]) };
}

/**
 * Texturen verkleinern: höchstens 1024 px, ohne Transparenz als JPEG (sips, ist auf jedem Mac da).
 * PNG mit Alpha (z. B. Blätter) bleibt PNG.
 */
async function texturenSchrumpfen(doc) {
  const tmp = await mkdtemp(tmpdir() + '/raumplaner-tex-');
  let i = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const bild = tex.getImage(); if (!bild) continue;
    const png = tex.getMimeType() === 'image/png', alpha = png && [4, 6].includes(bild[25]);
    const ein = `${tmp}/${i}.${png ? 'png' : 'jpg'}`, aus = `${tmp}/${i++}-k.${alpha ? 'png' : 'jpg'}`;
    await writeFile(ein, bild);
    const args = ['-Z', '1024', ein, '--out', aus];
    if (!alpha) args.unshift('-s', 'format', 'jpeg', '-s', 'formatOptions', '82');
    execFileSync('sips', args, { stdio: 'ignore' });
    const neu = await readFile(aus);
    if (neu.byteLength < bild.byteLength) { tex.setImage(new Uint8Array(neu)); tex.setMimeType(alpha ? 'image/png' : 'image/jpeg'); if (!alpha) tex.setURI(tex.getURI().replace(/\.png$/i, '.jpg')); }
  }
  await rm(tmp, { recursive: true, force: true });
}

const wahl = process.argv.slice(2);
const alle = [...POLYHAVEN, ...KENNEY].filter(m => !wahl.length || wahl.includes(m.id));
await mkdir(ZIEL, { recursive: true });
const katalogDatei = root + 'katalog/katalog.json';
const bisher = (await da(katalogDatei)) ? JSON.parse(await readFile(katalogDatei, 'utf8')) : { modelle: [] };
const eintraege = new Map(bisher.modelle.map(e => [e.id, e]));

for (const m of alle) {
  const q = m.quelle === 'Poly Haven' ? await polyhavenQuelle(m) : await kenneyQuelle(m);
  const doc = await io.read(q.pfad);
  const masse = ausrichten(doc, m);
  // Poly Haven in 1k (Texturen 1024 px, iPhone-tauglich); Netze zusammenfassen und komprimieren
  await texturenSchrumpfen(doc);
  await doc.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const glb = await io.writeBinary(doc);
  await writeFile(`${ZIEL}${m.id}.glb`, glb);
  eintraege.set(m.id, {
    id: m.id, name: m.name, kategorie: m.kategorie, ...masse, datei: `katalog/modelle/${m.id}.glb`, vorschau: `katalog/vorschau/${m.id}.png`,
    quelle: m.quelle, quelleUrl: q.quelleUrl, autor: q.autor, lizenz: 'CC0 1.0', stand: STAND
  });
  console.log(`${m.id.padEnd(28)} ${String(Math.round(glb.byteLength / 1024)).padStart(5)} KB  ${Math.round(masse.b * 100)} × ${Math.round(masse.t * 100)} × ${Math.round(masse.h * 100)} cm`);
}

const reihenfolge = [...POLYHAVEN, ...KENNEY].map(m => m.id);
const modelle = [...eintraege.values()].sort((a, b) => reihenfolge.indexOf(a.id) - reihenfolge.indexOf(b.id));
await writeFile(katalogDatei, JSON.stringify({
  hinweis: 'Erzeugt mit npm run modelle. Nur CC0-Modelle. Maße in Metern (b = Breite, t = Tiefe, h = Höhe), Vorderseite +Z.',
  modelle
}, null, 1) + '\n');
console.log(`katalog/katalog.json: ${modelle.length} Modelle`);
