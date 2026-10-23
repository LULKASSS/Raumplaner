// Raum aus eingetippten Maßen: Rechteck oder Wand für Wand, dazu Türen, Fenster, Durchgänge, Heizkörper.
//
// Messung, wie die App sie speichert (alles in Metern):
//   { form: 'rechteck', laenge, breite, gegen?: { laenge, breite }, hoehe, elemente: [...] }
//   { form: 'frei', waende: [{ laenge, knick: 'rechts' | 'links' | Grad }], hoehe, elemente: [...] }
// Gemessen wird im Uhrzeigersinn: Wand 1 oben im Grundriss, von links nach rechts, dann rechts herum.
// Element: { id, art: 'tuer' | 'fenster' | 'durchgang' | 'heizung', wand (Index), abstand (von der linken Ecke bis
//   zur Kante, von innen auf die Wand geschaut), breite, hoehe?, bruestung?, aufschlag?: 'innen' | 'aussen',
//   anschlag?: 'links' | 'rechts', tiefe? }

import { add, sub, mul, laenge, einheit, rad, huelle, flaeche, winkelFuerFront } from './geometrie.js';
import { innenNormale } from './raum.js';

export const STANDARD = {
  hoehe: 2.5,
  tuer: { breite: 0.885, hoehe: 2.01, aufschlag: 'innen', anschlag: 'links' },
  fenster: { breite: 1.2, hoehe: 1.3, bruestung: 0.9 },
  durchgang: { breite: 0.9, hoehe: 2.0 },
  heizung: { breite: 1.0, hoehe: 0.6, bruestung: 0.15, tiefe: 0.1 }
};

export const ELEMENT_NAMEN = { tuer: 'Tür', fenster: 'Fenster', durchgang: 'Durchgang', heizung: 'Heizkörper' };

/** Wandlängen der Messung (Rechteck: mit Gegenprobe gemittelt) und was dabei auffiel. */
export function wandKette(messung) {
  if (messung.form === 'rechteck') {
    const L = mittel(messung.laenge, messung.gegen?.laenge), B = mittel(messung.breite, messung.gegen?.breite);
    return [L, B, L, B].map(l => ({ laenge: l, knick: 'rechts' }));
  }
  return (messung.waende || []).map(w => ({ laenge: w.laenge, knick: w.knick ?? 'rechts' }));
}
const rund = v => Math.round(v * 1e9) / 1e9 + 0;
const mittel = (a, b) => (b > 0 ? (a + b) / 2 : a);

/** Unterschied der Gegenprobe beim Rechteck: [{ wand: 'laenge' | 'breite', d }] ab 5 mm. */
export function gegenprobe(messung) {
  if (messung.form !== 'rechteck' || !messung.gegen) return [];
  return ['laenge', 'breite']
    .filter(k => messung.gegen[k] > 0 && Math.abs(messung.gegen[k] - messung[k]) >= 0.005)
    .map(k => ({ wand: k, d: Math.abs(messung.gegen[k] - messung[k]) }));
}

const knickGrad = k => (k === 'links' ? -90 : k === 'rechts' || k == null ? 90 : Number(k));

/**
 * Eckpunkte aus der Wandkette. Geht der Raum nicht auf, wird der Fehler anteilig auf alle Ecken verteilt
 * (wie beim Vermessen) und als `offen` in Metern gemeldet.
 */
export function ecken(kette) {
  const punkte = [{ x: 0, z: 0 }];
  let richtung = 0, gesamt = 0;
  const strecken = [0];
  for (const w of kette) {
    const p = punkte[punkte.length - 1];
    punkte.push(add(p, mul({ x: Math.cos(rad(richtung)), z: Math.sin(rad(richtung)) }, w.laenge)));
    gesamt += w.laenge; strecken.push(gesamt);
    richtung += knickGrad(w.knick);
  }
  const fehler = punkte.pop();
  strecken.pop();
  const offen = laenge(fehler);
  const verteilt = punkte.map((p, i) => sub(p, mul(fehler, gesamt ? strecken[i] / gesamt : 0)));
  return { punkte: verteilt, offen };
}

/** Prüft die Messung; gibt eine Liste deutscher Meldungen zurück (leer = alles gut). */
export function pruefeMessung(messung) {
  const fehler = [];
  if (!(messung.hoehe > 0.5 && messung.hoehe < 10)) fehler.push('Raumhöhe fehlt');
  const kette = wandKette(messung);
  if (kette.length < 3) fehler.push('Mindestens drei Wände');
  kette.forEach((w, i) => { if (!(w.laenge > 0.05 && w.laenge < 100)) fehler.push(`Wand ${i + 1}: Länge fehlt`); });
  if (fehler.length) return fehler;
  for (const e of messung.elemente || []) {
    const w = kette[e.wand];
    if (!w) { fehler.push(`${ELEMENT_NAMEN[e.art] || 'Element'}: Wand fehlt`); continue; }
    if (e.abstand < 0 || e.abstand + e.breite > w.laenge + 0.005) fehler.push(`${ELEMENT_NAMEN[e.art]} passt nicht auf Wand ${e.wand + 1}`);
  }
  return fehler;
}

/**
 * Baut den Raum (gleiche Form wie der Scan-Import, siehe raum.js) aus der Messung.
 * Heizkörper werden zu festen Teilen in `feste`, die die Oberfläche zu den Möbeln legt.
 */
export function raumAusMassen(messung, { name = 'Raum' } = {}) {
  const fehler = pruefeMessung(messung);
  if (fehler.length) throw new Error(fehler.join(' · '));
  const kette = wandKette(messung), { punkte, offen } = ecken(kette);
  const h = huelle(punkte), mitte = { x: (h.minX + h.maxX) / 2, z: (h.minZ + h.maxZ) / 2 };
  const boden = punkte.map(p => sub(p, mitte)).map(p => ({ x: rund(p.x), z: rund(p.z) }));
  const waende = boden.map((a, i) => ({ id: `w${i + 1}`, a, b: boden[(i + 1) % boden.length], hoehe: messung.hoehe, dicke: 0 }));
  const raum = { name, waende, boden, oeffnungen: [], moebel: [] };

  const feste = [];
  for (const e of messung.elemente || []) {
    const w = waende[e.wand], u = einheit(sub(w.b, w.a)), n = innenNormale(w, raum);
    const s = STANDARD[e.art] || {}, breite = e.breite ?? s.breite;
    // Gemessen wurde an der Wand von der Ecke bis zur Kante; die Wand ist nach dem Ausgleich minimal anders lang
    const faktor = laenge(sub(w.b, w.a)) / kette[e.wand].laenge;
    const p = add(w.a, mul(u, (e.abstand + breite / 2) * faktor));
    if (e.art === 'heizung') {
      const t = e.tiefe ?? s.tiefe, c = add(p, mul(n, t / 2));
      feste.push({ id: e.id, kategorie: 'heizung', name: 'Heizkörper', quelle: 'raum', fest: true,
        x: c.x, z: c.z, winkel: winkelFuerFront(n), b: breite, t, h: e.hoehe ?? s.hoehe, ueberBoden: e.bruestung ?? s.bruestung });
      continue;
    }
    raum.oeffnungen.push({
      id: e.id, art: e.art === 'durchgang' ? 'oeffnung' : e.art, wandId: w.id, x: p.x, z: p.z, breite,
      hoehe: e.hoehe ?? s.hoehe, unten: e.art === 'fenster' ? (e.bruestung ?? s.bruestung) : 0,
      ...(e.art === 'tuer' ? { aufschlag: e.aufschlag ?? s.aufschlag, anschlag: e.anschlag ?? s.anschlag } : {})
    });
  }
  return { ...raum, feste, offen };
}

/** Fläche schon während des Eintippens, ohne Fehler zu werfen (null, solange etwas fehlt). */
export function vorschau(messung) {
  try { const r = raumAusMassen(messung); return { raum: r, flaeche: flaeche(r.boden) }; }
  catch { return null; }
}
