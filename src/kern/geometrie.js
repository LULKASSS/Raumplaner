// Ebene Geometrie für den Grundriss. Punkte sind {x, z} in Metern: Draufsicht, Y zeigt nach oben.
// Winkel in Grad, gedreht wie three.js (rotation.y), damit Kern und Zeichnung dieselbe Lage meinen.

/** So nah gilt als „berührt“, nicht als „überschneidet“ (5 mm). */
export const EPS = 0.005;

export const rad = g => g * Math.PI / 180;
export const grad = r => r * 180 / Math.PI;
export const normWinkel = g => ((g % 360) + 360) % 360;
/** Kleinster Unterschied zweier Winkel, −180 … 180. */
export const winkelDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

export const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.z * b.z;
export const laenge = a => Math.hypot(a.x, a.z);
export const einheit = a => { const l = laenge(a) || 1; return { x: a.x / l, z: a.z / l }; };
export const senkrecht = a => ({ x: -a.z, z: a.x });

/** Achsen eines um `winkel` gedrehten Körpers: x = Breite (nach rechts), z = Vorderseite. */
export function achsen(winkel) {
  const c = Math.cos(rad(winkel)), s = Math.sin(rad(winkel));
  return { ex: { x: c, z: -s }, ez: { x: s, z: c } };
}

/** Winkel, bei dem die Vorderseite in Richtung `n` zeigt. */
export const winkelFuerFront = n => normWinkel(grad(Math.atan2(n.x, n.z)));

/** Lokaler Punkt (u entlang der Breite, v nach vorn) → Grundriss. */
export function lokalZuWelt(mitte, winkel, u, v) {
  const { ex, ez } = achsen(winkel);
  return { x: mitte.x + ex.x * u + ez.x * v, z: mitte.z + ex.z * u + ez.z * v };
}

/** Grundfläche eines Körpers als vier Ecken: hinten links, hinten rechts, vorn rechts, vorn links. */
export function rechteck(mitte, winkel, b, t) {
  const hb = b / 2, ht = t / 2;
  return [[-hb, -ht], [hb, -ht], [hb, ht], [-hb, ht]].map(([u, v]) => lokalZuWelt(mitte, winkel, u, v));
}

/** Strecke a–b als schmales Rechteck der Dicke d (d = 0 bleibt eine Strecke). */
export function streckenRechteck(a, b, d = 0) {
  if (!d) return [a, b];
  const n = mul(einheit(senkrecht(sub(b, a))), d / 2);
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

/** Fläche (Gaußsche Trapezformel), immer positiv. */
export function flaeche(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p.x * q.z - q.x * p.z; }
  return Math.abs(s) / 2;
}

export function punktInPolygon(p, poly) {
  let innen = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) innen = !innen;
  }
  return innen;
}

export function huelle(punkte) {
  const xs = punkte.map(p => p.x), zs = punkte.map(p => p.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function projektion(poly, achse) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) { const d = dot(p, achse); if (d < min) min = d; if (d > max) max = d; }
  return [min, max];
}

/**
 * Wie tief sich zwei konvexe Polygone überschneiden (Trennachsen-Satz).
 * 0 = getrennt oder nur berührt. Ein Polygon aus zwei Punkten ist eine Strecke.
 */
export function eindringtiefe(a, b) {
  let tiefe = Infinity;
  for (const poly of [a, b]) {
    const kanten = poly.length === 2 ? 1 : poly.length;
    for (let i = 0; i < kanten; i++) {
      const k = sub(poly[(i + 1) % poly.length], poly[i]);
      if (!laenge(k)) continue;
      const achse = einheit(senkrecht(k));
      const [a0, a1] = projektion(a, achse), [b0, b1] = projektion(b, achse);
      if (a1 <= b0 || b1 <= a0) return 0;
      // so weit müsste man schieben, um sie zu trennen (bei einer Strecke ist das Intervall nur ein Punkt)
      const ueber = Math.min(a1 - b0, b1 - a0);
      if (ueber < tiefe) tiefe = ueber;
    }
  }
  return tiefe === Infinity ? 0 : tiefe;
}

/** Nächster Punkt auf der Strecke a–b zu p. */
export function naechsterPunkt(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return add(a, mul(ab, t));
}

function schneiden(a, b, c, d) {
  const kreuz = (o, p, q) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = kreuz(c, d, a), d2 = kreuz(c, d, b), d3 = kreuz(a, b, c), d4 = kreuz(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Kürzester Abstand zwischen zwei Strecken, mit den beiden nächsten Punkten. */
export function streckenAbstand(a, b, c, d) {
  if (schneiden(a, b, c, d)) { const q = naechsterPunkt(a, c, d); return { d: 0, p: q, q }; }
  let best = null;
  for (const [p, s0, s1, umgekehrt] of [[a, c, d, false], [b, c, d, false], [c, a, b, true], [d, a, b, true]]) {
    const q = naechsterPunkt(p, s0, s1), dist = laenge(sub(p, q));
    if (!best || dist < best.d) best = umgekehrt ? { d: dist, p: q, q: p } : { d: dist, p, q };
  }
  return best;
}

/** Abstand eines konvexen Polygons zu einer Strecke. p liegt am Polygon, q an der Strecke. */
export function polygonStreckenAbstand(poly, a, b) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const r = streckenAbstand(poly[i], poly[(i + 1) % poly.length], a, b);
    if (!best || r.d < best.d) best = r;
  }
  if (best.d > 0 && eindringtiefe(poly, [a, b]) > 0) best = { ...best, d: 0 };
  return best;
}
