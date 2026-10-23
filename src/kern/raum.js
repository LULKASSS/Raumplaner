// Raum-Modell und Import aus Apples CapturedRoom-JSON (RoomPlan).
//
// Raum, wie die App ihn hält (Meter, Grundriss x/z, Boden bei y = 0, Mitte des Raums bei 0/0):
//   { name, waende: [{ id, a, b, hoehe, dicke }],
//     oeffnungen: [{ id, art: 'tuer' | 'fenster' | 'oeffnung', wandId, x, z, breite, hoehe, unten }],
//     boden: [{ x, z }, …],
//     moebel: [{ id, kategorie, name, quelle: 'scan' | 'katalog' | 'eigen', x, z, winkel, b, t, h, ueberBoden }] }
// b = Breite (lokal x), t = Tiefe (lokal z, Vorderseite +z), h = Höhe. winkel in Grad wie three.js rotation.y.

import { add, sub, mul, laenge, einheit, senkrecht, grad, normWinkel, flaeche, huelle, punktInPolygon, naechsterPunkt } from './geometrie.js';

/** RoomPlan-Kategorien (CapturedRoom.Object.Category) auf Deutsch. */
export const KATEGORIEN = {
  sofa: 'Sofa', table: 'Tisch', chair: 'Stuhl', bed: 'Bett', storage: 'Schrank', television: 'Fernseher',
  refrigerator: 'Kühlschrank', stove: 'Herd', oven: 'Backofen', dishwasher: 'Spülmaschine', sink: 'Spüle',
  washerDryer: 'Waschmaschine', toilet: 'Toilette', bathtub: 'Badewanne', fireplace: 'Kamin', stairs: 'Treppe'
};
export const kategorieName = k => KATEGORIEN[k] || (k ? k[0].toUpperCase() + k.slice(1) : 'Möbel');

/** Kategorie aus `{ sofa: {} }`, `{ door: { isOpen } }` oder einfach `"sofa"`. */
function kategorie(c) {
  if (!c) return null;
  if (typeof c === 'string') return c;
  return Object.keys(c)[0] || null;
}

/** simd_float4x4 als 16 Zahlen (spaltenweise) oder als vier Spalten. */
function matrix(t) {
  const m = Array.isArray(t?.[0]) ? t.flat() : t;
  if (!Array.isArray(m) || m.length !== 16 || m.some(v => typeof v !== 'number' || !isFinite(v))) throw new Error('Transformationsmatrix fehlt oder ist kaputt');
  return m;
}
const spalte = (m, i) => ({ x: m[4 * i], y: m[4 * i + 1], z: m[4 * i + 2] });
const anwenden = (m, [x, y, z]) => ({
  x: m[0] * x + m[4] * y + m[8] * z + m[12],
  y: m[1] * x + m[5] * y + m[9] * z + m[13],
  z: m[2] * x + m[6] * y + m[10] * z + m[14]
});
/** Drehung um Y wie three.js, aus der lokalen X-Achse. */
const gier = m => { const c0 = spalte(m, 0); return normWinkel(grad(Math.atan2(-c0.z, c0.x))); };
const dims = d => { if (!Array.isArray(d) || d.length < 3) throw new Error('Maße fehlen'); return d.map(Number); };

/**
 * Liest ein CapturedRoom-JSON. Richtet den Raum gerade aus (längste Wandrichtung = x-Achse),
 * legt den Boden auf y = 0 und die Raummitte auf 0/0.
 */
export function leseCapturedRoom(json, { name = 'Raum' } = {}) {
  const roh = typeof json === 'string' ? JSON.parse(json) : json;
  if (!roh || !Array.isArray(roh.walls) || !roh.walls.length) throw new Error('Keine Wände gefunden – ist das ein CapturedRoom-JSON von RoomPlan?');

  const waende = roh.walls.map((w, i) => {
    const m = matrix(w.transform), [lang, hoehe, dicke] = dims(w.dimensions), mitte = spalte(m, 3), ax = spalte(m, 0);
    const u = einheit({ x: ax.x, z: ax.z }), halb = mul(u, lang / 2), p = { x: mitte.x, z: mitte.z };
    return { id: w.identifier || `wand-${i}`, a: sub(p, halb), b: add(p, halb), hoehe, dicke: dicke || 0, _unten: mitte.y - hoehe / 2 };
  });
  const boeden = (roh.floors || []).map(f => { try { return matrix(f.transform); } catch { return null; } }).filter(Boolean);
  const bodenY = Math.min(...waende.map(w => w._unten), ...boeden.map(m => m[13]));

  const oeffnungen = [];
  for (const [liste, art] of [[roh.doors, 'tuer'], [roh.windows, 'fenster'], [roh.openings, 'oeffnung']]) {
    for (const [i, o] of (liste || []).entries()) {
      const m = matrix(o.transform), [breite, hoehe] = dims(o.dimensions), c = spalte(m, 3);
      const p = { x: c.x, z: c.z };
      const wand = waende.find(w => w.id === o.parentIdentifier) || naechsteWandZu(p, waende);
      const auf = naechsterPunkt(p, wand.a, wand.b);
      oeffnungen.push({ id: o.identifier || `${art}-${i}`, art, wandId: wand.id, x: auf.x, z: auf.z, breite, hoehe, unten: Math.max(0, c.y - hoehe / 2 - bodenY) });
    }
  }

  const moebel = (roh.objects || []).map((o, i) => {
    const m = matrix(o.transform), [b, h, t] = dims(o.dimensions), c = spalte(m, 3), kat = kategorie(o.category);
    const ueber = c.y - h / 2 - bodenY;
    return { id: o.identifier || `moebel-${i}`, kategorie: kat, name: kategorieName(kat), quelle: 'scan', x: c.x, z: c.z, winkel: gier(m), b, t, h, ueberBoden: ueber > 0.05 ? ueber : 0 };
  });

  let boden = null;
  for (const f of roh.floors || []) {
    if (!Array.isArray(f.polygonCorners) || f.polygonCorners.length < 3) continue;
    const pkt = f.polygonCorners.map(p => anwenden(matrix(f.transform), p));
    const ys = pkt.map(p => p.y);
    if (Math.max(...ys) - Math.min(...ys) < 0.05) { boden = pkt.map(p => ({ x: p.x, z: p.z })); break; }
  }
  if (!boden) boden = bodenAusWaenden(waende);

  const raum = { name, waende: waende.map(({ _unten, ...w }) => w), oeffnungen, boden, moebel };
  return ausrichten(raum);
}

function naechsteWandZu(p, waende) {
  let best = null, bestD = Infinity;
  for (const w of waende) { const d = laenge(sub(p, naechsterPunkt(p, w.a, w.b))); if (d < bestD) { bestD = d; best = w; } }
  return best;
}

/** Boden als Kette der Wand-Endpunkte (RoomPlan liefert nicht immer eine Bodenfläche). */
export function bodenAusWaenden(waende) {
  const rest = waende.slice(1), kette = [waende[0].a, waende[0].b];
  let ende = waende[0].b;
  while (rest.length) {
    let bi = 0, bEnde = 'a', bd = Infinity;
    rest.forEach((w, i) => {
      for (const e of ['a', 'b']) { const d = laenge(sub(w[e], ende)); if (d < bd) { bd = d; bi = i; bEnde = e; } }
    });
    const w = rest.splice(bi, 1)[0], weiter = bEnde === 'a' ? w.b : w.a;
    if (bd > 0.05) kette.push(bEnde === 'a' ? w.a : w.b);
    kette.push(weiter); ende = weiter;
  }
  if (laenge(sub(kette[0], kette[kette.length - 1])) < 0.05) kette.pop();
  return kette;
}

/** Dreht den Raum so, dass die Wände entlang x/z laufen, und schiebt die Mitte auf 0/0. */
function ausrichten(raum) {
  let C = 0, S = 0;
  for (const w of raum.waende) {
    const d = sub(w.b, w.a), l = laenge(d), phi = Math.atan2(d.z, d.x);
    C += l * Math.cos(4 * phi); S += l * Math.sin(4 * phi);
  }
  const alpha = Math.atan2(S, C) / 4, c = Math.cos(alpha), s = Math.sin(alpha);
  // gleiche Drehung wie three.js rotation.y = alpha
  const dreh = p => ({ x: c * p.x + s * p.z, z: -s * p.x + c * p.z });
  const gedreht = raum.boden.map(dreh), h = huelle(gedreht), mitte = { x: (h.minX + h.maxX) / 2, z: (h.minZ + h.maxZ) / 2 };
  const t = p => { const q = sub(dreh(p), mitte); return { x: rund(q.x), z: rund(q.z) }; };
  const plus = grad(alpha);
  return {
    ...raum,
    boden: raum.boden.map(t),
    waende: raum.waende.map(w => ({ ...w, a: t(w.a), b: t(w.b) })),
    oeffnungen: raum.oeffnungen.map(o => ({ ...o, ...t(o) })),
    moebel: raum.moebel.map(m => ({ ...m, ...t(m), winkel: rundWinkel(normWinkel(m.winkel + plus)) }))
  };
}
const rund = v => Math.round(v * 1e5) / 1e5;
const rundWinkel = w => { const r = Math.round(w * 1e3) / 1e3; return r >= 360 ? 0 : r; };

/** Länge einer Wand in Metern. */
export const wandLaenge = w => laenge(sub(w.b, w.a));

/** Richtung, die von der Wand in den Raum zeigt. */
export function innenNormale(wand, raum) {
  const u = einheit(sub(wand.b, wand.a)), n = senkrecht(u), mitte = mul(add(wand.a, wand.b), 0.5);
  const probe = add(mitte, mul(n, 0.05));
  if (raum?.boden?.length >= 3) return punktInPolygon(probe, raum.boden) ? n : mul(n, -1);
  return n;
}

/** Breite × Tiefe (achsparallel nach dem Ausrichten), Fläche und Höhe des Raums. */
export function raumMasse(raum) {
  const h = huelle(raum.boden);
  return {
    breite: h.maxX - h.minX, tiefe: h.maxZ - h.minZ,
    flaeche: flaeche(raum.boden),
    hoehe: Math.max(0, ...raum.waende.map(w => w.hoehe))
  };
}
