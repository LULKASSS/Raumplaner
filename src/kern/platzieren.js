// Platzieren: Einrasten an Wänden und Möbeln, Drehen, Abstand zur Wand, Überschneidungen, Ersetzen.
// Reine Funktionen: bekommen Möbel und Raum, geben neue Objekte zurück, ändern nichts.

import { EPS, add, sub, mul, dot, einheit, laenge, achsen, rechteck, streckenRechteck, eindringtiefe, polygonStreckenAbstand, winkelDiff, normWinkel, winkelFuerFront, punktInPolygon, naechsterPunkt } from './geometrie.js';
import { innenNormale, wandLaenge } from './raum.js';

/** Drehschritt in Grad. */
export const SCHRITT = 15;
/** Fangbereich fürs Einrasten in Metern. */
export const SCHWELLE = 0.12;

export const grundflaeche = m => rechteck(m, m.winkel, m.b, m.t);

let zaehler = 0;
export const neueId = () => globalThis.crypto?.randomUUID?.() ?? `m-${Date.now().toString(36)}-${++zaehler}`;

/** Nächste Wand zur Grundfläche: Abstand d in Metern, Punkte p (am Möbel) und q (an der Wand) für die Maßlinie. */
export function wandAbstand(m, raum) {
  const poly = grundflaeche(m);
  let best = null;
  for (const w of raum.waende) {
    const r = polygonStreckenAbstand(poly, w.a, w.b), d = Math.max(0, r.d - w.dicke / 2);
    if (!best || d < best.d) best = { d, wandId: w.id, p: r.p, q: r.q };
  }
  return best;
}

/**
 * Abstand von jeder Seite des Möbels geradeaus bis zur Wand (für die Maßlinien beim Ziehen).
 * Ergebnis: [{ seite: 'hinten' | 'vorn' | 'links' | 'rechts', d, von, bis }], ohne Seiten, die ins Leere zeigen.
 */
export function seitenAbstaende(m, raum) {
  const { ex, ez } = achsen(m.winkel), hb = m.b / 2, ht = m.t / 2;
  const seiten = [
    ['hinten', mul(ez, -1), ht, ex, hb], ['vorn', ez, ht, ex, hb],
    ['links', mul(ex, -1), hb, ez, ht], ['rechts', ex, hb, ez, ht]
  ];
  const erg = [];
  for (const [seite, r, halb, quer, qh] of seiten) {
    let best = null;
    // aus der Mitte der Seite und knapp vor ihren Ecken geradeaus
    for (const q of [0, -qh * 0.98, qh * 0.98]) {
      const von = add(add(m, mul(r, halb)), mul(quer, q));
      for (const w of raum.waende) {
        const s = strahlTrifft(von, r, w.a, w.b);
        if (s === null) continue;
        const d = Math.max(0, s - w.dicke / 2);
        if (!best || d < best.d) best = { seite, d, von, bis: add(von, mul(r, d)), wandId: w.id };
      }
    }
    if (best) erg.push(best);
  }
  return erg;
}

function strahlTrifft(p, r, a, b) {
  const e = sub(b, a), nenner = r.x * e.z - r.z * e.x;
  if (Math.abs(nenner) < 1e-9) return null;
  const ap = sub(a, p), s = (ap.x * e.z - ap.z * e.x) / nenner, t = (ap.x * r.z - ap.z * r.x) / nenner;
  return s >= -EPS && t >= 0 && t <= 1 ? Math.max(0, s) : null;
}

const hoehenUeberlappen =(a, b) => Math.min(a.ueberBoden + a.h, b.ueberBoden + b.h) - Math.max(a.ueberBoden, b.ueberBoden) > EPS;

/**
 * Rastet ein Möbel ein, das gerade an x/z steht:
 * 1. an die nächste Wand im Fangbereich – parallel gedreht, Rückseite an der Wand
 *    (mit `ausrichtung: 'seite'` die Seite, mit `frei: true` nur wenn es schon parallel steht),
 * 2. in die Ecke, wenn eine zweite, querlaufende Wand im Fangbereich liegt,
 * 3. bündig an ein anderes Möbel, solange diese Richtung nicht schon an einer Wand hängt.
 * Gibt das neue Möbel und woran es hängt zurück.
 */
export function einrasten(m, raum, { schwelle = SCHWELLE, moebel = true } = {}) {
  let erg = { ...m };
  const an = [], gesperrt = [];

  const kandidaten = [];
  for (const w of raum.waende) {
    const n = innenNormale(w, raum), u = einheit(sub(w.b, w.a)), basis = winkelFuerFront(n);
    let k = 0;
    if (m.ausrichtung === 'seite') k = winkelDiff(m.winkel, basis) >= 0 ? 1 : -1;
    const winkel = normWinkel(basis + k * 90);
    if (m.frei && Math.abs(winkelDiff(m.winkel, winkel)) > 0.5) continue;
    const zurWand = k ? m.b / 2 : m.t / 2, quer = k ? m.t / 2 : m.b / 2;
    const rel = sub(m, w.a), luecke = dot(rel, n) - zurWand - w.dicke / 2, entlang = dot(rel, u);
    if (luecke > schwelle || luecke < -zurWand - 0.001) continue;
    if (entlang < -quer + 0.05 || entlang > wandLaenge(w) + quer - 0.05) continue;
    kandidaten.push({ w, n, winkel, luecke, quer });
  }
  kandidaten.sort((a, b) => Math.abs(a.luecke) - Math.abs(b.luecke));
  const erste = kandidaten[0];
  if (erste) {
    erg = { ...erg, winkel: erste.winkel, ...add(erg, mul(erste.n, -erste.luecke)) };
    an.push({ art: 'wand', id: erste.w.id }); gesperrt.push(erste.n);

    // Ecke: querlaufende Wand, gemessen mit der Ausdehnung quer zur ersten Wand
    let ecke = null;
    for (const w of raum.waende) {
      if (w === erste.w) continue;
      const n = innenNormale(w, raum), u = einheit(sub(w.b, w.a));
      if (Math.abs(dot(n, erste.n)) > 0.1) continue;
      const rel = sub(erg, w.a), luecke = dot(rel, n) - erste.quer - w.dicke / 2, entlang = dot(rel, u);
      if (luecke > schwelle || luecke < -erste.quer) continue;
      if (entlang < -0.05 || entlang > wandLaenge(w) + 0.05) continue;
      if (!ecke || Math.abs(luecke) < Math.abs(ecke.luecke)) ecke = { w, n, luecke };
    }
    if (ecke) {
      erg = { ...erg, ...add(erg, mul(ecke.n, -ecke.luecke)) };
      an.push({ art: 'wand', id: ecke.w.id }); gesperrt.push(ecke.n);
    }
  }

  if (moebel && gesperrt.length < 2) {
    const frei = r => gesperrt.every(n => Math.abs(dot(r, n)) < 0.1);
    let best = null;
    for (const o of raum.moebel) {
      if (o.id === m.id || !hoehenUeberlappen(erg, o)) continue;
      const d = winkelDiff(erg.winkel, o.winkel), viertel = Math.round(d / 90);
      if (Math.abs(d - viertel * 90) > 0.5) continue;
      const { ex, ez } = achsen(o.winkel), rel = sub(erg, o), u = dot(rel, ex), v = dot(rel, ez);
      const [hx, hz] = viertel % 2 ? [erg.t / 2, erg.b / 2] : [erg.b / 2, erg.t / 2];
      const ox = o.b / 2, oz = o.t / 2;
      const proben = [];
      if (Math.abs(v) < hz + oz - EPS) proben.push([ex, u, hx, ox]);
      if (Math.abs(u) < hx + ox - EPS) proben.push([ez, v, hz, oz]);
      for (const [r, pos, h1, h2] of proben) {
        if (!frei(r)) continue;
        // nur heranrücken oder knapp Überlappendes bündig machen; tief Hineingezogenes bleibt sichtbar überschnitten
        const seite = pos >= 0 ? 1 : -1, luecke = Math.abs(pos) - h1 - h2;
        if (Math.abs(luecke) > schwelle) continue;
        if (!best || Math.abs(luecke) < Math.abs(best.luecke)) best = { o, luecke, schub: mul(r, -seite * luecke) };
      }
    }
    if (best) { erg = { ...erg, ...add(erg, best.schub) }; an.push({ art: 'moebel', id: best.o.id }); }
  }
  return { moebel: erg, an };
}

/**
 * Ein Finger zieht: Möbel an den Punkt setzen, einrasten, Abstand zur nächsten Wand mitliefern.
 * Zieht der Finger über die Wand hinaus, bleibt das Möbel drinnen und rastet an dieser Wand ein.
 */
export function zieheAuf(m, punkt, raum, optionen) {
  let p = { x: punkt.x, z: punkt.z };
  if (raum.boden?.length >= 3 && !punktInPolygon(p, raum.boden)) {
    let best = null, bd = Infinity;
    for (const w of raum.waende) { const q = naechsterPunkt(p, w.a, w.b), d = laenge(sub(p, q)); if (d < bd) { bd = d; best = q; } }
    if (best) p = best;
  }
  const r = einrasten({ ...m, ...p }, raum, optionen);
  return { ...r, abstand: wandAbstand(r.moebel, raum), seiten: seitenAbstaende(r.moebel, raum) };
}

/** Nächster 15°-Schritt in Richtung +1 oder −1. Ein frei gedrehtes Möbel landet auf dem nächsten Raster. */
export function dreheSchritt(winkel, richtung) {
  const s = winkel / SCHRITT, n = richtung > 0 ? Math.floor(s + 1e-6) + 1 : Math.ceil(s - 1e-6) - 1;
  return normWinkel(n * SCHRITT);
}
export const drehe = (m, richtung) => ({ ...m, winkel: dreheSchritt(m.winkel, richtung), frei: false });
/** Freies Drehen, die Ausnahme. */
export function dreheFrei(m, winkel) {
  const w = normWinkel(winkel);
  return { ...m, winkel: w, frei: Math.abs(w / SCHRITT - Math.round(w / SCHRITT)) > 1e-6 };
}

/** Neue Maße; die Rückseite bleibt, wo sie war (steht das Möbel an der Wand, bleibt es dort). */
export function setzeMasse(m, { b = m.b, t = m.t, h = m.h } = {}) {
  const { ez } = achsen(m.winkel), d = (t - m.t) / 2;
  return { ...m, b, t, h, x: m.x + ez.x * d, z: m.z + ez.z * d };
}

/** „12 cm breiter“, „3 cm niedriger“ … – was am neuen Teil anders ist. */
export function vergleich(alt, neu) {
  const teile = [];
  const z = (d, mehr, weniger) => { const cm = Math.round(d * 100); if (cm) teile.push(`${Math.abs(cm)} cm ${cm > 0 ? mehr : weniger}`); };
  z(neu.b - alt.b, 'breiter', 'schmaler');
  z(neu.t - alt.t, 'tiefer', 'weniger tief');
  z(neu.h - alt.h, 'höher', 'niedriger');
  return teile.length ? teile : ['gleich groß'];
}

/** Ersetzt ein Möbel (z. B. einen gescannten Körper) durch eine Vorlage aus dem Katalog: Lage, Ausrichtung und Rückseite bleiben. */
export function ersetze(alt, vorlage) {
  const neu = {
    ...setzeMasse(alt, vorlage),
    kategorie: vorlage.kategorie ?? alt.kategorie, name: vorlage.name ?? alt.name,
    quelle: vorlage.quelle ?? 'katalog', modell: vorlage.modell ?? null,
    scan: alt.quelle === 'scan' ? { kategorie: alt.kategorie, b: alt.b, t: alt.t, h: alt.h } : alt.scan
  };
  return { moebel: neu, unterschied: vergleich(alt, neu) };
}

/** Kopie daneben, eingerastet: rechts, links, davor oder dahinter – wo zuerst Platz ist, sonst rechts. */
export function dupliziere(m, raum) {
  const { ex, ez } = achsen(m.winkel), id = neueId(), mit = { ...raum, moebel: [...raum.moebel.filter(o => o.id !== m.id), m] };
  const versuche = [mul(ex, m.b + 0.05), mul(ex, -(m.b + 0.05)), mul(ez, m.t + 0.05), mul(ez, -(m.t + 0.05))].map(d => {
    const kopie = { ...m, id, ...add(m, d) };
    delete kopie.scan;
    return einrasten(kopie, mit).moebel;
  });
  return versuche.find(k => !ueberschneidungen({ ...mit, moebel: [...mit.moebel, k] })[id]) ?? versuche[0];
}

/** Neues Möbel aus einer Vorlage an einem Punkt absetzen. */
export function stelleAuf(vorlage, punkt, raum) {
  const m = { id: neueId(), kategorie: vorlage.kategorie ?? null, name: vorlage.name ?? 'Möbel', quelle: vorlage.quelle ?? 'katalog',
    modell: vorlage.modell ?? null, b: vorlage.b, t: vorlage.t, h: vorlage.h, ueberBoden: 0, winkel: vorlage.winkel ?? 0, x: punkt.x, z: punkt.z };
  return einrasten(m, raum).moebel;
}

/**
 * Schwenkbereich einer Tür. Mit `aufschlag`/`anschlag` (beim Ausmessen angegeben) der echte Viertelkreis,
 * `anschlag` von innen auf die Wand geschaut; nach außen aufgehend gibt es keinen. Ohne Angabe (Scan) gilt
 * das ganze Quadrat Türbreite × Türbreite vor der Tür (Annahme: geht nach innen auf).
 */
export function schwenkbereich(tuer, raum) {
  const w = raum.waende.find(x => x.id === tuer.wandId);
  if (!w || tuer.aufschlag === 'aussen') return null;
  const n = innenNormale(w, raum), links = { x: -n.z, z: n.x }, hb = tuer.breite / 2, p = { x: tuer.x, z: tuer.z };
  if (tuer.anschlag === 'links' || tuer.anschlag === 'rechts') {
    const s = tuer.anschlag === 'links' ? 1 : -1, angel = add(p, mul(links, s * hb)), zu = mul(links, -s);
    const bogen = [];
    for (let i = 0; i <= 8; i++) {
      const phi = (i / 8) * Math.PI / 2;
      bogen.push(add(angel, mul(add(mul(zu, Math.cos(phi)), mul(n, Math.sin(phi))), tuer.breite)));
    }
    return [angel, ...bogen];
  }
  const l = add(p, mul(links, hb)), r = sub(p, mul(links, hb));
  return [l, r, add(r, mul(n, tuer.breite)), add(l, mul(n, tuer.breite))];
}

/**
 * Überschneidungen aller Möbel mit Wänden, Tür-Schwenkbereichen und anderen Möbeln.
 * Bündig anstoßen zählt nicht. Ergebnis: { [möbelId]: [{ art: 'wand' | 'tuer' | 'moebel', id }] }.
 */
export function ueberschneidungen(raum) {
  const erg = {};
  const flaechen = raum.moebel.map(m => ({ m, poly: grundflaeche(m) }));
  const tueren = raum.oeffnungen.filter(o => o.art === 'tuer').map(o => ({ o, poly: schwenkbereich(o, raum) })).filter(t => t.poly);
  for (const { m, poly } of flaechen) {
    const liste = [];
    for (const w of raum.waende) if (eindringtiefe(poly, streckenRechteck(w.a, w.b, w.dicke)) > EPS) liste.push({ art: 'wand', id: w.id });
    for (const { o, poly: s } of tueren) if (m.ueberBoden < o.unten + o.hoehe && eindringtiefe(poly, s) > EPS) liste.push({ art: 'tuer', id: o.id });
    for (const { m: n, poly: q } of flaechen) if (n !== m && hoehenUeberlappen(m, n) && eindringtiefe(poly, q) > EPS) liste.push({ art: 'moebel', id: n.id });
    if (liste.length) erg[m.id] = liste;
  }
  return erg;
}
