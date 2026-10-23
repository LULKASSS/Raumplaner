// Grundriss als SVG: zeichnet Raum, Türen, Fenster und Möbel und setzt Finger und Maus in Ziehen, Tippen,
// Verschieben und Zoomen um. Rechnet nichts selbst – Einrasten und Überschneidung kommen aus dem Kern.

import { add, sub, mul, einheit, laenge, punktInPolygon, huelle, naechsterPunkt } from '../kern/geometrie.js';
import { innenNormale, wandLaenge } from '../kern/raum.js';
import { grundflaeche, schwenkbereich } from '../kern/platzieren.js';

const WAND = 0.1; // gezeichnete Wanddicke in Metern (nach außen)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r1 = v => Math.round(v * 10) / 10;

/**
 * @param {HTMLElement} el Behälter
 * @param {object} o  modus: 'planen' | 'messen'; rand: { oben, unten } in px; beiTippen(id | null); beiZiehen(id, punkt, phase);
 *                    beiWandTippen(index)
 */
export function erstelleGrundriss(el, o) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Grundriss');
  el.append(svg);
  let sicht = null, daten = null, eingepasst = false;
  const rand = () => ({ oben: 20, unten: 20, links: 20, rechts: 20, ...(typeof o.rand === 'function' ? o.rand() : o.rand) });

  const groesse = () => ({ w: el.clientWidth, h: el.clientHeight });
  const zuSchirm = p => ({ x: (p.x - sicht.cx) * sicht.s + sicht.ox, y: (p.z - sicht.cz) * sicht.s + sicht.oy });
  const zuWelt = (x, y) => ({ x: (x - sicht.ox) / sicht.s + sicht.cx, z: (y - sicht.oy) / sicht.s + sicht.cz });
  const lokal = e => { const b = svg.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

  function einpassen() {
    if (!daten?.raum) return;
    const { w, h } = groesse(), r = rand(), hb = huelle(daten.raum.boden), m = WAND + 0.35;
    const bw = hb.maxX - hb.minX + 2 * m, bh = hb.maxZ - hb.minZ + 2 * m;
    const s = Math.max(10, Math.min((w - r.links - r.rechts) / bw, (h - r.oben - r.unten) / bh));
    sicht = { s, fit: s, cx: (hb.minX + hb.maxX) / 2, cz: (hb.minZ + hb.maxZ) / 2, ox: r.links + (w - r.links - r.rechts) / 2, oy: r.oben + (h - r.oben - r.unten) / 2 };
    eingepasst = true;
  }

  function zoomUm(px, py, faktor) {
    const vor = zuWelt(px, py);
    sicht.s = Math.max(sicht.fit * 0.4, Math.min(sicht.fit * 8, sicht.s * faktor));
    const nach = zuWelt(px, py);
    sicht.cx += vor.x - nach.x; sicht.cz += vor.z - nach.z;
  }

  /* ---------- Zeichnen ---------- */
  function zeichne(neu) {
    daten = neu;
    if (!daten?.raum) { svg.innerHTML = ''; return; }
    const { w, h } = groesse();
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (!eingepasst || daten.neuEinpassen) einpassen();
    const { raum } = daten, s = sicht.s, teile = [];
    const pfad = pts => 'M' + pts.map(p => { const q = zuSchirm(p); return `${r1(q.x)},${r1(q.y)}`; }).join('L') + 'Z';

    teile.push(`<defs>
      <pattern id="schraffur" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(135)"><line class="schraffur-linie" x1="0" y1="0" x2="0" y2="7"/></pattern>
      <pattern id="schraffurFest" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(135)"><line class="schraffur-fest" x1="0" y1="0" x2="0" y2="5"/></pattern>
    </defs>`);

    // Boden und Wände (Ring nach außen)
    const aussen = versetzt(raum, WAND);
    teile.push(`<path class="g-boden" d="${pfad(raum.boden)}"/>`);
    teile.push(`<path class="g-wand" fill-rule="evenodd" d="${pfad(aussen)} ${pfad(raum.boden)}"/>`);
    if (daten.aktiveWand != null) {
      const i = daten.aktiveWand, n = raum.boden.length, a = raum.boden[i], b = raum.boden[(i + 1) % n];
      teile.push(`<path class="g-wand aktiv" d="${pfad([a, b, aussen[(i + 1) % n], aussen[i]])}"/>`);
    }
    for (const i of daten.platzhalter || []) {
      const a = zuSchirm(raum.waende[i].a), b = zuSchirm(raum.waende[i].b);
      teile.push(`<line class="g-platzhalter" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }

    // Türen, Fenster, Durchgänge
    const tuerTreffer = new Set(Object.values(daten.kollisionen || {}).flat().filter(k => k.art === 'tuer').map(k => k.id));
    for (const oe of raum.oeffnungen) {
      const wand = raum.waende.find(x => x.id === oe.wandId); if (!wand) continue;
      const u = einheit(sub(wand.b, wand.a)), n = innenNormale(wand, raum), p = { x: oe.x, z: oe.z }, hb = oe.breite / 2;
      const l = sub(p, mul(u, hb)), r = add(p, mul(u, hb)), aus = mul(n, -(WAND + 0.01)), ein = mul(n, 0.004);
      const luecke = [add(l, ein), add(r, ein), add(r, aus), add(l, aus)];
      if (oe.art === 'fenster') {
        teile.push(`<path class="g-fenster" d="${pfad(luecke)}"/>`);
        const m1 = zuSchirm(add(l, mul(n, -WAND / 2))), m2 = zuSchirm(add(r, mul(n, -WAND / 2)));
        teile.push(`<line class="g-tuer" x1="${m1.x}" y1="${m1.y}" x2="${m2.x}" y2="${m2.y}"/>`);
        continue;
      }
      teile.push(`<path class="g-luecke" d="${pfad(luecke)}"/>`);
      if (oe.art !== 'tuer') continue;
      const bereich = schwenkbereich(oe, raum);
      if (!bereich) continue;
      teile.push(`<path class="g-schwenk${tuerTreffer.has(oe.id) ? ' rot' : ''}" d="${pfad(bereich)}"/>`);
      if (oe.anschlag) {
        const angel = zuSchirm(bereich[0]), offenEnde = zuSchirm(bereich[bereich.length - 1]), zuEnde = zuSchirm(bereich[1]);
        // Bogen vom offenen Türblatt zur geschlossenen Lage; SVG-Bogen 1 = im Uhrzeigersinn (y zeigt nach unten)
        const rr = oe.breite * s, sweep = winkelSinn(bereich[0], bereich[bereich.length - 1], bereich[1]) ? 1 : 0;
        teile.push(`<line class="g-tuer" x1="${angel.x}" y1="${angel.y}" x2="${offenEnde.x}" y2="${offenEnde.y}"/>`);
        teile.push(`<path class="g-tuer" d="M${offenEnde.x},${offenEnde.y} A${rr},${rr} 0 0 ${sweep} ${zuEnde.x},${zuEnde.y}"/>`);
      }
    }

    // Wandmaße
    raum.waende.forEach((wand, i) => {
      // Beschriftung außen an der Wand; an senkrechten Wänden bündig daneben statt mittig darüber
      // Beschriftung außen an der Wand, entlang der Wand gedreht (wie in einer Bauzeichnung), nie auf dem Kopf
      const n = innenNormale(wand, raum), mitte = mul(add(wand.a, wand.b), 0.5), q = zuSchirm(add(mitte, mul(n, -(WAND + 11 / s))));
      const a = zuSchirm(wand.a), b = zuSchirm(wand.b);
      let grad = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (grad > 90) grad -= 180; if (grad <= -90) grad += 180;
      const cm = Math.round(wandLaenge(wand) * 100), aktiv = i === daten.aktiveWand;
      const text = o.modus === 'messen' ? `Wand ${i + 1}${daten.platzhalter?.includes(i) ? '' : ` · ${cm} cm`}` : `${cm} cm`;
      teile.push(`<text class="g-wandmass${aktiv ? ' aktiv' : ''}" text-anchor="middle" transform="rotate(${r1(grad)} ${r1(q.x)} ${r1(q.y)})" x="${r1(q.x)}" y="${r1(q.y)}">${text}</text>`);
    });
    if (daten.ecke != null) {
      const q = zuSchirm(raum.waende[daten.ecke].a);
      teile.push(`<circle class="g-ecke" cx="${q.x}" cy="${q.y}" r="6"/>`);
    }

    // Möbel
    const rot = daten.kollisionen || {};
    for (const m of raum.moebel) {
      const poly = grundflaeche(m), d = pfad(poly), wahl = m.id === daten.auswahl, getroffen = !!rot[m.id] && !m.fest;
      const klasse = ['g-m', m.fest ? 'fest' : '', getroffen ? 'rot' : wahl ? 'wahl' : ''].join(' ');
      teile.push(`<path class="${klasse}" d="${d}"><title>${esc(m.name || 'Möbel')}</title></path>`);
      if (m.fest) teile.push(`<path class="g-schraffur-fest" d="${d}"/>`);
      if (getroffen) teile.push(`<path class="g-schraffur" d="${d}"/>`);
      if (!m.fest && m.t * s > 18) {
        // Rückenlehne / Rückseite andeuten, damit man sieht, wo vorne ist
        const tief = Math.min(0.14, m.t * 0.22), [hl, hr] = poly, ez = sub(poly[3], poly[0]), e = mul(einheit(ez), tief);
        const a = zuSchirm(add(hl, e)), b = zuSchirm(add(hr, e));
        teile.push(`<line class="g-ruecken" x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}"/>`);
      }
      const hb = huelle(poly.map(zuSchirm).map(q => ({ x: q.x, z: q.y }))), bw = hb.maxX - hb.minX, bh = hb.maxZ - hb.minZ, c = zuSchirm(m);
      const name = esc(m.name || ''), passt = name.length * 6.6 + 10 < bw && bh > 18;
      if (passt) {
        const mass = `${Math.round(m.b * 100)} × ${Math.round(m.t * 100)}`, zwei = bh > 36 && mass.length * 6 + 8 < bw;
        teile.push(`<text class="g-name" x="${r1(c.x)}" y="${r1(c.y - (zwei ? 7 : 0))}">${name}</text>`);
        if (zwei) teile.push(`<text class="g-mass" x="${r1(c.x)}" y="${r1(c.y + 8)}">${mass}</text>`);
      }
    }

    // Abstände beim Ziehen
    for (const a of daten.ziehen?.seiten || []) {
      if (a.d < 0.005) continue;
      const p = zuSchirm(a.von), q = zuSchirm(a.bis), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const text = `${Math.round(a.d * 100)} cm`, bw = text.length * 7.2 + 14;
      teile.push(`<line class="g-linie" x1="${r1(p.x)}" y1="${r1(p.y)}" x2="${r1(q.x)}" y2="${r1(q.y)}"/>`);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 10)
        teile.push(`<rect class="g-pille" x="${r1(mx - bw / 2)}" y="${r1(my - 11)}" width="${r1(bw)}" height="22" rx="11"/><text class="g-pille-text" x="${r1(mx)}" y="${r1(my)}">${text}</text>`);
    }
    svg.innerHTML = teile.join('');
  }

  const neuZeichnen = () => daten && zeichne({ ...daten, neuEinpassen: false });

  /* ---------- Treffer ---------- */
  function moebelBei(p) {
    const liste = daten?.raum?.moebel || [];
    for (let i = liste.length - 1; i >= 0; i--) if (!liste[i].fest && punktInPolygon(p, grundflaeche(liste[i]))) return liste[i];
    // kleine Teile großzügiger treffen
    let best = null, bd = 14 / sicht.s;
    for (const m of liste) {
      if (m.fest) continue;
      const poly = grundflaeche(m);
      for (let i = 0; i < 4; i++) { const d = laenge(sub(p, naechsterPunkt(p, poly[i], poly[(i + 1) % 4]))); if (d < bd) { bd = d; best = m; } }
    }
    return best;
  }
  function wandBei(p) {
    let best = null, bd = 24 / sicht.s;
    (daten?.raum?.waende || []).forEach((w, i) => { const d = laenge(sub(p, naechsterPunkt(p, w.a, w.b))); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ---------- Finger und Maus ---------- */
  const zeiger = new Map();
  let geste = null;
  svg.addEventListener('pointerdown', e => {
    if (!sicht) return;
    svg.setPointerCapture(e.pointerId);
    zeiger.set(e.pointerId, lokal(e));
    if (zeiger.size === 1) {
      const p0 = lokal(e), w = zuWelt(p0.x, p0.y), m = o.modus === 'planen' ? moebelBei(w) : null;
      geste = m ? { art: 'ziehen', id: m.id, griff: sub(w, m), start: p0, bewegt: false }
        : { art: 'leer', start: p0, cx: sicht.cx, cz: sicht.cz, bewegt: false };
    } else if (zeiger.size === 2) {
      if (geste?.art === 'ziehen' && geste.bewegt) o.beiZiehen?.(geste.id, null, 'ende');
      const [a, b] = [...zeiger.values()];
      geste = { art: 'zwei', abstand: Math.hypot(a.x - b.x, a.y - b.y), mitte: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!zeiger.has(e.pointerId) || !geste) return;
    const p = lokal(e); zeiger.set(e.pointerId, p);
    if (geste.art === 'zwei' && zeiger.size === 2) {
      const [a, b] = [...zeiger.values()], abstand = Math.hypot(a.x - b.x, a.y - b.y), mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      sicht.cx -= (mitte.x - geste.mitte.x) / sicht.s; sicht.cz -= (mitte.y - geste.mitte.y) / sicht.s;
      if (geste.abstand > 10) zoomUm(mitte.x, mitte.y, abstand / geste.abstand);
      geste.abstand = abstand; geste.mitte = mitte;
      neuZeichnen(); return;
    }
    const weit = Math.hypot(p.x - geste.start.x, p.y - geste.start.y) > 6;
    if (geste.art === 'ziehen') {
      if (!geste.bewegt && !weit) return;
      geste.bewegt = true;
      o.beiZiehen?.(geste.id, sub(zuWelt(p.x, p.y), geste.griff), 'bewegt');
    } else if (geste.art === 'leer') {
      if (!geste.bewegt && !weit) return;
      geste.bewegt = true;
      sicht.cx = geste.cx - (p.x - geste.start.x) / sicht.s; sicht.cz = geste.cz - (p.y - geste.start.y) / sicht.s;
      neuZeichnen();
    }
  });
  const ende = e => {
    if (!zeiger.has(e.pointerId)) return;
    const p = lokal(e);
    zeiger.delete(e.pointerId);
    if (!geste) return;
    if (geste.art === 'ziehen') {
      if (geste.bewegt) o.beiZiehen?.(geste.id, sub(zuWelt(p.x, p.y), geste.griff), 'ende');
      else o.beiTippen?.(geste.id);
    } else if (geste.art === 'leer' && !geste.bewegt && e.type === 'pointerup') {
      const w = zuWelt(p.x, p.y);
      if (o.modus === 'messen') { const i = wandBei(w); if (i != null) o.beiWandTippen?.(i); }
      else o.beiTippen?.(null);
    }
    if (geste.art === 'zwei' && zeiger.size === 1) {
      const [rest] = zeiger.values();
      geste = { art: 'leer', start: rest, cx: sicht.cx, cz: sicht.cz, bewegt: true };
    } else if (!zeiger.size) geste = null;
  };
  svg.addEventListener('pointerup', ende);
  svg.addEventListener('pointercancel', ende);
  svg.addEventListener('wheel', e => {
    if (!sicht) return;
    e.preventDefault();
    const p = lokal(e);
    if (e.ctrlKey) zoomUm(p.x, p.y, Math.exp(-e.deltaY * 0.01));          // Pinch auf dem Trackpad
    else if (e.deltaMode === 0 && (e.deltaX || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40)) {
      sicht.cx += e.deltaX / sicht.s; sicht.cz += e.deltaY / sicht.s;     // zwei Finger wischen
    } else zoomUm(p.x, p.y, Math.exp(-e.deltaY * 0.002));                  // Mausrad
    neuZeichnen();
  }, { passive: false });
  // Safari am Mac: Pinch auf dem Trackpad
  let gs = 1;
  svg.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; });
  svg.addEventListener('gesturechange', e => { e.preventDefault(); const p = lokal(e); zoomUm(p.x, p.y, e.scale / gs); gs = e.scale; neuZeichnen(); });

  new ResizeObserver(() => { if (daten) { einpassen(); neuZeichnen(); } }).observe(el);

  return {
    zeichne,
    einpassen: () => { einpassen(); neuZeichnen(); },
    /** Punkt in der Mitte des sichtbaren Bereichs (für neue Möbel). */
    mitte: () => { const { w, h } = groesse(), r = rand(); return zuWelt(r.links + (w - r.links - r.rechts) / 2, r.oben + (h - r.oben - r.unten) / 2); },
    /** Möbel sichtbar halten, wenn unten ein Sheet aufgeht. */
    sichtbarMachen(m, untenFrei) {
      if (!sicht || !m) return;
      const q = zuSchirm(m), { h } = groesse(), oben = rand().oben, unten = h - untenFrei;
      if (q.y < oben + 30 || q.y > unten - 30) { sicht.cz += (q.y - (oben + unten) / 2) / sicht.s; neuZeichnen(); }
    },
    zuSchirm: p => sicht && zuSchirm(p)
  };
}

function winkelSinn(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0; }

/** Boden-Polygon um d nach außen versetzt (Gehrung an den Ecken). */
function versetzt(raum, d) {
  const n = raum.boden.length, linien = raum.waende.map(w => {
    const nn = mul(innenNormale(w, raum), -d);
    return { a: add(w.a, nn), u: einheit(sub(w.b, w.a)) };
  });
  const erg = [];
  for (let i = 0; i < n; i++) {
    const L1 = linien[(i - 1 + n) % n], L2 = linien[i];
    const kreuz = L1.u.x * L2.u.z - L1.u.z * L2.u.x;
    if (Math.abs(kreuz) < 1e-6) { erg.push(L2.a); continue; }
    const t = ((L2.a.x - L1.a.x) * L2.u.z - (L2.a.z - L1.a.z) * L2.u.x) / kreuz;
    erg.push(add(L1.a, mul(L1.u, t)));
  }
  return erg;
}

