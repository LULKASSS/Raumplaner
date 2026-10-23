// Kleine Bausteine für die Oberfläche: Elemente bauen, Symbole, Segment, Schalter, Bottom Sheet, Hinweis.

/** h('div.klasse', { onclick }, kind, …) – baut ein Element. */
export function h(tag, attrs, ...kinder) {
  const [name, ...klassen] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (klassen.length) el.className = klassen.join(' ');
  if (attrs && (attrs.constructor !== Object)) { kinder.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k in el && !(el instanceof SVGElement) && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kinder.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
}

// Symbole, an SF Symbols angelehnt (24er Raster)
const PFADE = {
  zurueck: 'M15 5l-7 7 7 7',
  pfeil: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  mehr: 'M5 12h.01M12 12h.01M19 12h.01',
  links15: 'M3 4v6h6M3.5 10A9 9 0 1 1 6 18.5',
  rechts15: 'M21 4v6h-6M20.5 10A9 9 0 1 0 18 18.5',
  kopie: 'M8 8h11v11H8zM5 16V5h11',
  tausch: 'M4 9h13l-3-3M20 15H7l3 3',
  muell: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  x: 'M6 6l12 12M18 6L6 18',
  lupe: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8',
  lineal: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  raum: 'M4 4h16v16H4zM4 12h6M14 4v6',
  datei: 'M6 3h8l4 4v14H6zM14 3v4h4',
  teilen: 'M12 3v12M8 7l4-4 4 4M5 12v8h14v-8',
  stift: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  kasten: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  wolke: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  haken: 'M5 12l5 5 9-10'
};
export function ico(name, klasse = '') {
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', ('ico ' + klasse).trim()); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', PFADE[name]); s.append(p);
  return s;
}

/** Segmented Control. optionen: [[wert, text]]. */
export function segment(optionen, wert, beiWahl, klasse = '') {
  const daumen = h('span.daumen');
  const seg = h('div.seg' + (klasse ? '.' + klasse : ''), { role: 'tablist' }, daumen);
  const setze = w => {
    const i = Math.max(0, optionen.findIndex(o => o[0] === w));
    daumen.style.width = `calc((100% - 4px) / ${optionen.length})`;
    daumen.style.transform = `translateX(${i * 100}%)`;
    seg.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', j === i));
  };
  for (const [w, text] of optionen) seg.append(h('button', { type: 'button', role: 'tab', onclick: () => { setze(w); beiWahl(w); } }, text));
  setze(wert);
  seg.setze = setze;
  return seg;
}

export function schalter(an, beiWechsel, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: an, 'aria-label': label, onchange: e => beiWechsel(e.target.checked) });
  return h('span.schalter', input, h('i'));
}

/** Zahlfeld in Zentimetern. wert in Metern (oder null). */
export function cmFeld(wert, beiAenderung, { label, platzhalter = '', einheit = 'cm', beiFokus, beiEnde } = {}) {
  const input = h('input', {
    type: 'text', inputMode: 'decimal', enterKeyHint: 'next', autocomplete: 'off', 'aria-label': label, placeholder: platzhalter,
    value: wert > 0 ? zahlText(wert * 100) : ''
  });
  input.addEventListener('focus', () => { input.select(); beiFokus?.(); });
  input.addEventListener('input', () => {
    const v = Number(input.value.trim().replace(',', '.'));
    beiAenderung(input.value.trim() === '' ? null : (isFinite(v) && v > 0 ? v / 100 : null), false);
  });
  input.addEventListener('change', () => {
    // Unsinn (Buchstaben, 0, negativ) beim Verlassen leeren statt stehen lassen
    const v = Number(input.value.trim().replace(',', '.'));
    if (input.value.trim() && !(isFinite(v) && v > 0)) { input.value = ''; beiAenderung(null, true); }
    beiEnde?.();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); naechstesFeld(input); } });
  return h('span.feld', input, h('span', einheit));
}
const zahlText = v => (Math.round(v * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1, useGrouping: false });

export function naechstesFeld(input) {
  const alle = [...input.closest('.schirm, .blatt').querySelectorAll('input[inputmode="decimal"], input.text')];
  const i = alle.indexOf(input);
  if (alle[i + 1]) alle[i + 1].focus(); else input.blur();
}

/* ---------- Bottom Sheet ---------- */
let offenesBlatt = null;
/**
 * Öffnet ein Bottom Sheet. `durchsichtig`: Ansicht dahinter bleibt bedienbar (Möbel-Sheet).
 * Gibt { blatt, schliessen } zurück.
 */
export function oeffneBlatt(inhalt, { hoch = false, durchsichtig = false, beiSchliessen } = {}) {
  schliesseBlatt(true);
  const blatt = h('div.blatt' + (hoch ? '.hoch' : ''), { role: 'dialog', 'aria-modal': !durchsichtig },
    h('div.griff', h('i')), inhalt);
  const huelle = h('div.huelle' + (durchsichtig ? '.durchsichtig' : ''), h('div.abdunkeln', { onclick: () => schliessen() }), blatt);
  document.body.append(huelle);
  requestAnimationFrame(() => requestAnimationFrame(() => huelle.classList.add('offen')));
  // am Griff nach unten ziehen schließt
  const griff = blatt.querySelector('.griff');
  let y0 = null;
  griff.addEventListener('pointerdown', e => { y0 = e.clientY; griff.setPointerCapture(e.pointerId); blatt.style.transition = 'none'; });
  griff.addEventListener('pointermove', e => { if (y0 != null) blatt.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  griff.addEventListener('pointerup', e => {
    const weit = e.clientY - y0 > 80; y0 = null; blatt.style.transition = ''; blatt.style.transform = '';
    if (weit) schliessen();
  });
  const schliessen = (sofort = false) => {
    if (offenesBlatt?.huelle !== huelle) return;
    offenesBlatt = null;
    huelle.classList.remove('offen');
    setTimeout(() => huelle.remove(), sofort ? 0 : 500);
    beiSchliessen?.();
  };
  offenesBlatt = { huelle, blatt, schliessen };
  return offenesBlatt;
}
export function schliesseBlatt(sofort) { offenesBlatt?.schliessen(sofort); }
export const blattOffen = () => offenesBlatt;

/* ---------- Hinweis oben ---------- */
let toastZeit;
export function hinweis(text, { ok = false } = {}) {
  const t = document.getElementById('toast');
  t.replaceChildren(ok ? h('span.ok', '✓ ') : '', text);
  t.classList.add('da');
  clearTimeout(toastZeit);
  toastZeit = setTimeout(() => t.classList.remove('da'), 2600);
}
