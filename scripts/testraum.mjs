/* Erzeugt den erfundenen Testraum als CapturedRoom-JSON (Form wie RoomPlan): daten/testraum.json
 * Wohnzimmer 4,20 × 3,60 m, 2,50 m hoch, Tür, Fenster, Sofa, Tisch, Stuhl, Regal.
 * Absichtlich wie ein echter Scan: Ursprung irgendwo im Raum, Boden bei −1,42 m, ganzer Raum um 20° verdreht,
 * Sofa 3 cm vor der Wand und 2° schief. Kein echter Scan, keine echte Wohnung. */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DREHUNG = 20, VERSATZ = { x: 1.3, z: -2.1 }, BODEN = -1.42;
const rad = g => g * Math.PI / 180;
let nr = 0;
const id = () => `00000000-0000-4000-8000-${String(++nr).padStart(12, '0')}`;

// Raum-Koordinaten (x, z) → „Scan“-Koordinaten
function welt(x, z) {
  const c = Math.cos(rad(DREHUNG)), s = Math.sin(rad(DREHUNG));
  return { x: c * x + s * z + VERSATZ.x, z: -s * x + c * z + VERSATZ.z };
}
// Transformationsmatrix (spaltenweise, 16 Zahlen wie simd_float4x4): Drehung um Y, dann Lage
function matrix(gier, p, y) {
  const c = Math.cos(rad(gier)), s = Math.sin(rad(gier)), r = v => Math.round(v * 1e6) / 1e6;
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, p.x, y, p.z, 1].map(r);
}
// Fläche mit Mittelpunkt (x, z) im Raum, deren lokale X-Achse in Richtung `gier` zeigt
const flaeche = (x, z, gier, y) => matrix(gier + DREHUNG, welt(x, z), y);

const H = 2.5;
const waende = [
  { name: 'Süd', a: [0, 0], b: [4.2, 0] },
  { name: 'Ost', a: [4.2, 0], b: [4.2, 3.6] },
  { name: 'Nord', a: [4.2, 3.6], b: [0, 3.6] },
  { name: 'West', a: [0, 3.6], b: [0, 0] }
].map(w => {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
  const gier = Math.atan2(-dz, dx) * 180 / Math.PI;
  return {
    identifier: id(), category: { wall: {} }, confidence: { high: {} },
    dimensions: [Math.hypot(dx, dz), H, 0],
    transform: flaeche((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, gier, BODEN + H / 2),
    parentIdentifier: null, polygonCorners: [], completedEdges: [], story: 0, _wand: w.name
  };
});
const wand = n => waende.find(w => w._wand === n);
const tuer = {
  identifier: id(), category: { door: { isOpen: false } }, confidence: { high: {} },
  dimensions: [0.88, 2.0, 0], transform: flaeche(0, 0.6, 90, BODEN + 1.0),
  parentIdentifier: wand('West').identifier, polygonCorners: [], completedEdges: [], story: 0
};
const fenster = {
  identifier: id(), category: { window: {} }, confidence: { medium: {} },
  dimensions: [1.4, 1.3, 0], transform: flaeche(2.1, 3.6, 180, BODEN + 0.9 + 0.65),
  parentIdentifier: wand('Nord').identifier, polygonCorners: [], completedEdges: [], story: 0
};
// Möbel: dimensions = Breite, Höhe, Tiefe; Mitte des Körpers; Vorderseite zeigt in lokale +Z
const objekt = (kat, [b, h, t], x, z, gier) => ({
  identifier: id(), category: { [kat]: {} }, confidence: { high: {} },
  dimensions: [b, h, t], transform: flaeche(x, z, gier, BODEN + h / 2), attributes: {}, story: 0
});
const objekte = [
  objekt('sofa', [2.1, 0.82, 0.92], 2.4, 0.03 + 0.46, 2),
  objekt('table', [1.2, 0.75, 0.7], 2.4, 1.9, 0),
  objekt('chair', [0.5, 0.9, 0.55], 1.4, 1.9, 90),
  objekt('storage', [0.8, 1.8, 0.4], 4.0, 2.6, 270)
];
const boden = {
  identifier: id(), category: { floor: {} }, confidence: { high: {} },
  dimensions: [4.2, 3.6, 0],
  // Boden liegt in seiner lokalen XY-Ebene, Normale = lokale Z → nach oben drehen (−90° um X)
  transform: (() => {
    const m = matrix(DREHUNG, welt(2.1, 1.8), BODEN);
    const c0 = m.slice(0, 3), c2 = m.slice(8, 11);
    return [...c0, 0, ...c2.map(v => -v), 0, 0, 1, 0, 0, m[12], m[13], m[14], 1];
  })(),
  polygonCorners: [[-2.1, -1.8, 0], [2.1, -1.8, 0], [2.1, 1.8, 0], [-2.1, 1.8, 0]],
  parentIdentifier: null, completedEdges: [], story: 0
};

const raum = {
  _hinweis: 'Erfundener Testraum, kein echter Scan. Erzeugt mit npm run testraum.',
  identifier: id(), version: 2, story: 0,
  walls: waende.map(({ _wand, ...w }) => w), doors: [tuer], windows: [fenster], openings: [],
  objects: objekte, floors: [boden], sections: []
};
await mkdir(root + 'daten', { recursive: true });
await writeFile(root + 'daten/testraum.json', JSON.stringify(raum, null, 1).replace(/\[[-0-9.,\s]+\]/g, m => m.replace(/\s+/g, '')) + '\n');
console.log('daten/testraum.json geschrieben');
