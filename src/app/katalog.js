// Katalog: echte Modelle aus katalog/katalog.json (Poly Haven und Kenney, CC0, mit Quelle und Stand je Modell)
// und eigene Modelle aus der IndexedDB. Maße in Metern (b × t × h).

import { alleModelle } from './speicher.js';

export const KATEGORIEN = [
  ['sofa', 'Sofas & Sessel'], ['bett', 'Betten'], ['tisch', 'Tische'], ['stuhl', 'Stühle'],
  ['schrank', 'Schränke'], ['regal', 'Regale'], ['sonst', 'Sonstiges'], ['eigen', 'Eigene']
];

export const EIGENES = { kategorie: 'sonst', name: 'Eigenes Möbel', b: 1.0, t: 0.5, h: 0.8, quelle: 'eigen' };

let katalog = null;
/** Katalog-Modelle (einmal geladen). Ohne Netz und ohne Datei: leer statt Fehler. */
export function katalogModelle() {
  katalog ??= fetch(new URL('../../katalog/katalog.json', import.meta.url))
    .then(r => (r.ok ? r.json() : { modelle: [] }))
    .then(d => d.modelle.map(m => ({ ...m, modell: 'katalog:' + m.id, vorschau: new URL('../../' + m.vorschau, import.meta.url).href })))
    .catch(() => []);
  return katalog;
}
export async function katalogEintrag(id) { return (await katalogModelle()).find(m => m.id === id); }

/** Alle Vorlagen: Katalog plus eigene Modelle dieses Geräts. */
export async function alleVorlagen() {
  const eigene = (await alleModelle()).map(m => ({ id: m.id, name: m.name, kategorie: 'eigen', b: m.b, t: m.t, h: m.h, modell: 'eigen:' + m.id, quelle: 'eigen', vorschau: m.vorschau || null }));
  return [...eigene, ...(await katalogModelle())];
}

export function filtere(liste, text, kategorie) {
  const q = text.trim().toLowerCase();
  return liste.filter(m => (!kategorie || m.kategorie === kategorie) && (!q || m.name.toLowerCase().includes(q)));
}
