// Raumplaner – Oberfläche. Ein Zustand S, drei Schirme: Start, Ausmessen, Planen.
// Rechnen (Raum aus Maßen, Einrasten, Überschneidung) kommt aus src/kern/, Zeichnen aus grundriss.js / ansicht3d.js.

import { h, ico, segment, schalter, cmFeld, oeffneBlatt, schliesseBlatt, blattOffen, hinweis } from './ui.js';
import { alleRaeume, ladeRaum, speichereRaum, loescheRaum, nurImSpeicher } from './speicher.js';
import { KATEGORIEN, EIGENES, suche } from './katalog.js';
import { TESTRAUM } from './testraum.js';
import { erstelleGrundriss } from './grundriss.js';
import { raumAusMassen, pruefeMessung, gegenprobe, ecken, wandKette, STANDARD, ELEMENT_NAMEN } from '../kern/ausmessen.js';
import { raumMasse } from '../kern/raum.js';
import { zieheAuf, ueberschneidungen, drehe, dreheFrei, setzeMasse, ersetze, dupliziere, stelleAuf, neueId } from '../kern/platzieren.js';
import { neuerVerlauf, schritt, rueckgaengig, wiederholen, kannZurueck, kannVor } from '../kern/verlauf.js';
import { raumText, cm } from '../kern/format.js';

const S = { schirm: null, doc: null, verlauf: null, auswahl: null, modus: 'grundriss', live: null, seiten: null, raumCache: null };
const app = document.getElementById('app');
const kopie = x => structuredClone(x);
const stand = doc => kopie({ name: doc.name, messung: doc.messung, moebel: doc.moebel });

/* ---------- Raum aus dem Dokument ---------- */
function raumVon(doc) {
  const schluessel = JSON.stringify([doc.name, doc.messung]);
  if (S.raumCache?.schluessel !== schluessel) S.raumCache = { schluessel, raum: raumAusMassen(doc.messung, { name: doc.name }) };
  const r = S.raumCache.raum;
  return { ...r, moebel: [...r.feste, ...doc.moebel] };
}

let speicherZeit;
function sichern() {
  clearTimeout(speicherZeit);
  const doc = kopie(S.doc);
  speicherZeit = setTimeout(() => speichereRaum(doc).catch(() => hinweis('Speichern hat nicht geklappt')), 250);
}
function schrittMachen() { S.verlauf = schritt(S.verlauf, stand(S.doc)); sichern(); }

/* ---------- Schirmwechsel wie bei iOS ---------- */
function zeige(neu, richtung = 'vor') {
  const alt = S.schirm;
  S.schirm = neu;
  if (!alt || richtung === 'ohne') { alt?.remove(); app.append(neu); return; }
  if (richtung === 'vor') {
    neu.classList.add('rechts'); app.append(neu);
    requestAnimationFrame(() => requestAnimationFrame(() => { neu.classList.remove('rechts'); alt.classList.add('links'); }));
  } else {
    neu.classList.add('links'); app.prepend(neu);
    requestAnimationFrame(() => requestAnimationFrame(() => { neu.classList.remove('links'); alt.classList.add('rechts'); }));
  }
  setTimeout(() => alt.remove(), 520);
}

/* ================= Start ================= */
async function zeigeStart(richtung = 'zurueck') {
  schliesseBlatt(true);
  history.replaceState(null, '', location.pathname);
  const raeume = await alleRaeume();
  const datei = h('input', { type: 'file', accept: '.json,.raumplan,application/json', class: 'versteckt', onchange: e => dateiOeffnen(e.target.files[0]) });
  const liste = raeume.length
    ? h('div.liste', raeume.map(d => {
      let info = '';
      try { info = raumText(raumMasse(raumAusMassen(d.messung))); } catch { info = 'Maße unvollständig'; }
      return h('button.zeile.mit-ico', { onclick: () => oeffneRaum(d) },
        h('span.kachel', ico('raum')), h('span.haupt', h('b', d.name || 'Raum'), h('small', info)), ico('pfeil', 'pfeil'));
    }))
    : null;
  const schirm = h('section.schirm', h('div.inhalt', h('div.spalte',
    h('div.start-kopf', h('button.knopf', { onclick: () => zeigeMessen(neuesDokument(), 'vor') }, ico('lineal'), 'Raum ausmessen')),
    liste && h('div.abschnitt', h('h3', 'Deine Räume'), liste),
    h('div.abschnitt', h('div.liste',
      h('button.zeile.mit-ico', { onclick: testraumOeffnen }, h('span.kachel.grau', ico('kasten')), h('span.haupt', h('b', 'Testraum ansehen'), h('small', 'Erfundenes Wohnzimmer zum Ausprobieren')), ico('pfeil', 'pfeil')),
      h('button.zeile.mit-ico', { onclick: () => datei.click() }, h('span.kachel.grau', ico('datei')), h('span.haupt', h('b', 'Raum-Datei öffnen'), h('small', 'Von einem anderen Gerät')), ico('pfeil', 'pfeil'))
    ), nurImSpeicher() ? h('p.fuss', 'Dieser Browser erlaubt kein Speichern – nach dem Schließen ist alles weg.') : null),
    datei
  )));
  zeige(schirm, richtung);
}

const neuesDokument = () => ({ id: neueId(), name: '', messung: { form: 'rechteck', laenge: null, breite: null, hoehe: STANDARD.hoehe, elemente: [] }, moebel: [], neu: true });

async function testraumOeffnen() {
  const doc = await speichereRaum({ id: neueId(), ...kopie(TESTRAUM) });
  oeffneRaum(doc);
}

async function dateiOeffnen(datei) {
  if (!datei) return;
  try {
    const roh = JSON.parse(await datei.text());
    if (roh.format !== 'raumplaner-raum' || !roh.raum?.messung) throw new Error('Das ist keine Raum-Datei aus dem Raumplaner');
    const fehler = pruefeMessung(roh.raum.messung);
    if (fehler.length) throw new Error(fehler[0]);
    const vorhanden = await ladeRaum(roh.raum.id);
    const doc = await speichereRaum({ ...roh.raum, id: vorhanden ? neueId() : roh.raum.id, moebel: roh.raum.moebel || [] });
    hinweis(`${doc.name || 'Raum'} geöffnet`, { ok: true });
    oeffneRaum(doc);
  } catch (e) { hinweis(e.message || 'Datei lässt sich nicht lesen'); }
}

function oeffneRaum(doc, richtung = 'vor') {
  S.doc = kopie(doc); delete S.doc.neu;
  S.verlauf = neuerVerlauf(stand(S.doc));
  S.auswahl = null; S.live = null; S.raumCache = null;
  zeigePlanen(richtung);
}

/* ================= Ausmessen ================= */
function zeigeMessen(doc, richtung = 'vor') {
  const M = { doc: kopie(doc), fokus: null, ecke: null, offen: null, fehler: '' };
  const istNeu = !!doc.neu;
  const kopf = h('header.kopf',
    h('button.zurueck', { onclick: () => istNeu ? zeigeStart() : zeigePlanen('zurueck') }, ico('zurueck'), istNeu ? 'Räume' : S.doc.name || 'Raum'),
    h('div.titel', h('b', 'Ausmessen')), h('div.rechts'));
  const planEl = h('div.mess-plan');
  const inhalt = h('div.inhalt');
  const fehlerEl = h('p.fehler');
  const fertig = h('button.knopf', { onclick: abschliessen }, istNeu ? 'Möbel stellen' : 'Fertig');
  const schirm = h('section.schirm.mess', kopf, planEl, h('div.mess-blatt', inhalt, h('div.mess-fuss', fehlerEl, fertig)));
  zeige(schirm, richtung);

  const plan = erstelleGrundriss(planEl, {
    modus: 'messen',
    rand: () => ({ oben: kopf.offsetHeight + 34, unten: innerWidth >= 900 ? 30 : 40, links: 24, rechts: 24 }),
    beiWandTippen: i => {
      if (M.offen) { const e = element(M.offen); if (e) { e.wand = i; passeEin(e); baue(); } }
      else { M.fokus = i; zeichnePlan(); }
    }
  });
  const m = () => M.doc.messung;
  const element = id => m().elemente.find(e => e.id === id);
  const passeEin = e => {
    const L = wandKette(m())[e.wand]?.laenge;
    if (L > 0 && (e.abstand + e.breite > L || e.abstand < 0)) e.abstand = Math.max(0, Math.round((L - e.breite) / 2 * 100) / 100);
  };

  // Vorschau mit Platzhaltern, solange Maße fehlen
  function vorschau() {
    const mm = kopie(m()), platz = [];
    if (mm.form === 'rechteck') {
      if (!(mm.laenge > 0)) { mm.laenge = 4; platz.push(0, 2); }
      if (!(mm.breite > 0)) { mm.breite = 3; platz.push(1, 3); }
    } else mm.waende = mm.waende.map((w, i) => (w.laenge > 0 ? w : (platz.push(i), { ...w, laenge: 1.5 })));
    if (!(mm.hoehe > 0.5)) mm.hoehe = 2.5;
    const kette = wandKette(mm);
    mm.elemente = mm.elemente.filter(e => kette[e.wand] && e.abstand >= 0 && e.abstand + e.breite <= kette[e.wand].laenge + 0.005);
    try { return { raum: raumAusMassen(mm), platz }; } catch { return null; }
  }
  function zeichnePlan() {
    const v = vorschau();
    if (!v) return;
    const r = { ...v.raum, moebel: v.raum.feste };
    plan.zeichne({ raum: r, aktiveWand: M.fokus, ecke: M.ecke, platzhalter: v.platz, neuEinpassen: true });
  }
  function status() {
    const fehler = pruefeMessung(m());
    fertig.classList.toggle('leise', fehler.length > 0);
    fehlerEl.textContent = M.fehler && fehler.length ? fehler[0] : '';
    for (const el of inhalt.querySelectorAll('[data-status]')) el.replaceWith(statusZeile(el.dataset.status));
  }
  const aendern = () => { zeichnePlan(); status(); };

  function statusZeile(art) {
    const mm = m();
    if (art === 'gegen') {
      const d = gegenprobe(mm);
      const text = !mm.gegen?.laenge && !mm.gegen?.breite ? '' : d.length ? d.map(x => `${x.wand === 'laenge' ? 'Wand 1 / 3' : 'Wand 2 / 4'}: ${cm(x.d)} Unterschied, gemittelt`).join(' · ') : 'Gegenüber gleich lang';
      return h('div.zeile', { 'data-status': art }, h('span.haupt'), h('span.hinweis' + (d.length ? '' : '.ok'), text));
    }
    let text = '', ok = false;
    try { const kette = wandKette(mm); if (kette.every(w => w.laenge > 0)) { const off = ecken(kette).offen; ok = off < 0.005; text = ok ? 'Raum geht auf' : `${cm(off)} offen – nachmessen?`; } } catch { /* unvollständig */ }
    return h('div.zeile', { 'data-status': art }, h('span.haupt'), h('span.hinweis' + (ok ? '.ok' : text ? '.rot' : ''), text));
  }

  const feldZeile = (label, wert, setze, { wand, eckeVon } = {}) => {
    const zeile = h('label.zeile', h('span.haupt', h('b', label)), cmFeld(wert, v => { setze(v); aendern(); }, {
      label,
      beiFokus: () => { M.fokus = wand ?? M.fokus; M.ecke = eckeVon ?? null; inhalt.querySelectorAll('.fokus').forEach(x => x.classList.remove('fokus')); zeile.classList.add('fokus'); zeichnePlan(); }
    }));
    return zeile;
  };

  function baue() {
    const oben = inhalt.scrollTop, mm = m();
    const teile = [];
    teile.push(h('div.abschnitt', h('div.liste', h('label.zeile', h('input.text', {
      type: 'text', value: M.doc.name, placeholder: 'Name, z. B. Wohnzimmer', 'aria-label': 'Name des Raums', enterKeyHint: 'next',
      oninput: e => { M.doc.name = e.target.value; }
    })))));
    teile.push(h('div.abschnitt', segment([['rechteck', 'Rechteck'], ['frei', 'Andere Form']], mm.form, f => {
      if (f === mm.form) return;
      if (f === 'frei') {
        const k = mm.laenge > 0 && mm.breite > 0 ? wandKette(mm) : [{}, {}, {}, {}];
        mm.waende = k.map(w => ({ laenge: w.laenge ?? null, knick: 'rechts' }));
      } else {
        // zurück zum Rechteck: eigene Werte bleiben, nur Leeres aus der freien Form übernehmen
        if (!(mm.laenge > 0)) mm.laenge = mm.waende?.[0]?.laenge ?? null;
        if (!(mm.breite > 0)) mm.breite = mm.waende?.[1]?.laenge ?? null;
      }
      mm.form = f; M.fokus = null; baue();
    })));

    if (mm.form === 'rechteck') {
      const gegen = !!mm.gegen;
      teile.push(h('div.abschnitt', h('h3', 'Wände'), h('div.liste',
        feldZeile('Wand 1 · oben', mm.laenge, v => { mm.laenge = v; }, { wand: 0 }),
        feldZeile('Wand 2 · rechts', mm.breite, v => { mm.breite = v; }, { wand: 1 }),
        h('div.zeile', h('span.haupt', h('b', 'Gegenüber nachmessen')), schalter(gegen, an => { if (an) mm.gegen = { laenge: null, breite: null }; else delete mm.gegen; baue(); aendern(); }, 'Gegenüber nachmessen')),
        gegen && feldZeile('Wand 3 · unten', mm.gegen.laenge, v => { mm.gegen.laenge = v; }, { wand: 2 }),
        gegen && feldZeile('Wand 4 · links', mm.gegen.breite, v => { mm.gegen.breite = v; }, { wand: 3 }),
        gegen && statusZeile('gegen'),
        feldZeile('Raumhöhe', mm.hoehe, v => { mm.hoehe = v; })
      )));
    } else {
      const zeilen = mm.waende.map((w, i) => {
        const z = feldZeile(`Wand ${i + 1}`, w.laenge, v => { w.laenge = v; }, { wand: i });
        z.classList.add('wandzeile');
        if (i < mm.waende.length - 1) z.append(segment([['rechts', 'dann rechts'], ['links', 'dann links']], w.knick === 'links' ? 'links' : 'rechts', k => { w.knick = k; aendern(); }, 'klein'));
        return z;
      });
      teile.push(h('div.abschnitt', h('h3', 'Wände im Uhrzeigersinn'), h('div.liste', zeilen,
        statusZeile('frei'),
        h('div.zeile', h('span.haupt', h('div.chips',
          h('button.chip', { type: 'button', onclick: () => { mm.waende.push({ laenge: null, knick: 'rechts' }); baue(); aendern(); } }, ico('plus'), 'Wand'),
          mm.waende.length > 3 && h('button.chip', { type: 'button', onclick: () => { mm.waende.pop(); mm.elemente = mm.elemente.filter(e => e.wand < mm.waende.length); baue(); aendern(); } }, 'Letzte entfernen')
        ))),
        feldZeile('Raumhöhe', mm.hoehe, v => { mm.hoehe = v; })
      )));
    }

    // Türen, Fenster, Durchgänge, Heizkörper
    const anzahl = wandKette(mm).length;
    const elZeilen = [];
    for (const e of mm.elemente) {
      const offen = M.offen === e.id;
      elZeilen.push(h('button.zeile.elementkopf' + (offen ? '.element-offen' : ''), { type: 'button', onclick: () => { M.offen = offen ? null : e.id; M.fokus = offen ? null : e.wand; M.ecke = null; baue(); } },
        h('span.haupt', h('b', `${ELEMENT_NAMEN[e.art]} · Wand ${e.wand + 1}`), h('small', `${cm(e.abstand)} von links · ${cm(e.breite)} breit`)), ico(offen ? 'x' : 'pfeil', 'pfeil')));
      if (!offen) continue;
      elZeilen.push(h('div.zeile', h('span.haupt', h('b', 'Wand')),
        h('button.rund', { type: 'button', 'aria-label': 'Wand davor', onclick: () => { e.wand = (e.wand - 1 + anzahl) % anzahl; passeEin(e); M.fokus = e.wand; baue(); aendern(); } }, ico('zurueck')),
        h('span', `Wand ${e.wand + 1}`),
        h('button.rund', { type: 'button', 'aria-label': 'Nächste Wand', onclick: () => { e.wand = (e.wand + 1) % anzahl; passeEin(e); M.fokus = e.wand; baue(); aendern(); } }, ico('pfeil'))));
      elZeilen.push(feldZeile('Abstand zur linken Ecke', e.abstand, v => { e.abstand = v ?? 0; }, { wand: e.wand, eckeVon: e.wand }));
      elZeilen.push(feldZeile('Breite', e.breite, v => { e.breite = v ?? 0; }, { wand: e.wand }));
      if (e.art === 'tuer') {
        elZeilen.push(h('div.zeile', h('span.haupt', h('b', 'Geht auf')), segment([['innen', 'nach innen'], ['aussen', 'nach außen']], e.aufschlag, v => { e.aufschlag = v; aendern(); }, 'klein')));
        elZeilen.push(h('div.zeile', h('span.haupt', h('b', 'Angeln')), segment([['links', 'links'], ['rechts', 'rechts']], e.anschlag, v => { e.anschlag = v; aendern(); }, 'klein')));
      }
      if (e.art === 'fenster') elZeilen.push(feldZeile('Brüstung', e.bruestung, v => { e.bruestung = v ?? 0; }, { wand: e.wand }));
      if (e.art === 'heizung') elZeilen.push(feldZeile('Tiefe', e.tiefe, v => { e.tiefe = v ?? 0.1; }, { wand: e.wand }), feldZeile('Über dem Boden', e.bruestung, v => { e.bruestung = v ?? 0; }, { wand: e.wand }));
      elZeilen.push(feldZeile('Höhe', e.hoehe, v => { e.hoehe = v ?? 0; }, { wand: e.wand }));
      elZeilen.push(h('button.zeile.rot', { type: 'button', onclick: () => { mm.elemente = mm.elemente.filter(x => x !== e); M.offen = null; M.ecke = null; baue(); aendern(); } }, h('span.haupt', h('b', 'Entfernen'))));
    }
    const neuesElement = art => {
      const wand = M.fokus ?? 0, L = wandKette(mm)[wand]?.laenge || 1, s = STANDARD[art];
      const e = { id: neueId(), art, wand, breite: Math.min(s.breite, L), abstand: 0, hoehe: s.hoehe, ...(s.bruestung != null ? { bruestung: s.bruestung } : {}), ...(s.tiefe ? { tiefe: s.tiefe } : {}), ...(art === 'tuer' ? { aufschlag: s.aufschlag, anschlag: s.anschlag } : {}) };
      e.abstand = Math.max(0, Math.round((L - e.breite) / 2 * 100) / 100);
      mm.elemente.push(e); M.offen = e.id; M.fokus = wand; baue(); aendern();
    };
    teile.push(h('div.abschnitt', h('h3', 'Türen, Fenster, Heizkörper'),
      elZeilen.length ? h('div.liste', elZeilen) : null,
      h('div.chips', { style: elZeilen.length ? 'margin-top:12px' : '' }, ['tuer', 'fenster', 'durchgang', 'heizung'].map(art =>
        h('button.chip', { type: 'button', onclick: () => neuesElement(art) }, ico('plus'), ELEMENT_NAMEN[art])))));

    inhalt.replaceChildren(h('div.spalte', teile));
    inhalt.scrollTop = oben;
    status();
  }

  async function abschliessen() {
    const fehler = pruefeMessung(m());
    if (fehler.length) { M.fehler = true; status(); return; }
    M.doc.name = M.doc.name.trim() || 'Raum';
    delete M.doc.neu;
    if (istNeu) { const d = await speichereRaum(M.doc); oeffneRaum(d); return; }
    S.doc.name = M.doc.name; S.doc.messung = M.doc.messung; S.raumCache = null;
    schrittMachen();
    zeigePlanen('zurueck');
  }

  baue();
  requestAnimationFrame(zeichnePlan);
}

/* ================= Planen ================= */
let P = null; // Bausteine des Planen-Schirms

function zeigePlanen(richtung = 'vor') {
  history.replaceState(null, '', '#raum=' + encodeURIComponent(S.doc.id));
  const titel = h('div.titel', h('b'), h('small'));
  const kopf = h('header.kopf',
    h('button.zurueck', { onclick: () => zeigeStart() }, ico('zurueck'), 'Räume'),
    titel,
    h('div.rechts', h('button.rund', { 'aria-label': 'Mehr', onclick: mehrBlatt }, ico('mehr'))));
  const planEl = h('div.buehne'), dreiEl = h('div.buehne.versteckt');
  const undo = h('button.glas-rund', { 'aria-label': 'Rückgängig', onclick: zurueck }, ico('undo'));
  const redo = h('button.glas-rund', { 'aria-label': 'Wiederholen', onclick: vor }, ico('redo'));
  const leiste = h('div.leiste', undo, redo, h('button.plus', { onclick: () => katalogBlatt() }, ico('plus'), 'Möbel'));
  const wahl = h('div.ansicht-wahl', segment([['grundriss', 'Grundriss'], ['3d', '3D']], S.modus, modusWechsel));
  const schirm = h('section.schirm', planEl, dreiEl, kopf, wahl, leiste);
  zeige(schirm, richtung);

  const plan = erstelleGrundriss(planEl, {
    modus: 'planen',
    rand: () => ({ oben: kopf.offsetHeight + 60, unten: 96, links: 20, rechts: 20 }),
    beiTippen: tippen, beiZiehen: ziehen
  });
  P = { schirm, titel, plan, planEl, dreiEl, drei: null, undo, redo, leiste };
  if (S.modus === '3d') modusWechsel('3d');
  zeichnePlan(true);
}

function modusWechsel(m) {
  S.modus = m;
  P.planEl.classList.toggle('versteckt', m !== 'grundriss');
  P.dreiEl.classList.toggle('versteckt', m !== '3d');
  if (m === '3d' && !P.drei) {
    import('./ansicht3d.js').then(({ erstelle3D }) => {
      P.drei = erstelle3D(P.dreiEl, { beiTippen: tippen, beiZiehen: ziehen });
      P.drei.aktiv(true); zeichnePlan();
    }).catch(() => hinweis('3D lässt sich hier nicht anzeigen'));
  }
  P.drei?.aktiv(m === '3d');
  zeichnePlan();
}

function aktuellerRaum() {
  const r = raumVon(S.doc);
  if (S.live) r.moebel = r.moebel.map(m => (m.id === S.live.id ? S.live : m));
  return r;
}

function zeichnePlan(neuEinpassen = false) {
  if (!P || !S.doc) return;
  const raum = aktuellerRaum(), kollisionen = ueberschneidungen(raum);
  const daten = { raum, auswahl: S.auswahl, kollisionen, ziehen: S.live ? { seiten: S.seiten } : null, neuEinpassen };
  P.titel.querySelector('b').textContent = S.doc.name || 'Raum';
  P.titel.querySelector('small').textContent = raumText(raumMasse(raum));
  P.undo.disabled = !kannZurueck(S.verlauf); P.redo.disabled = !kannVor(S.verlauf);
  if (S.modus === 'grundriss') P.plan.zeichne(daten); else P.drei?.zeichne(daten);
  P.blattAktualisieren?.();
}

function tippen(id) {
  if (!id) { S.auswahl = null; schliesseBlatt(); zeichnePlan(); return; }
  S.auswahl = id; zeichnePlan();
  moebelBlatt(id);
}

function ziehen(id, punkt, phase) {
  const m0 = S.doc.moebel.find(m => m.id === id);
  if (!m0) return;
  if (punkt) {
    const r = zieheAuf(m0, punkt, raumVon(S.doc));
    S.live = r.moebel; S.seiten = r.seiten; S.auswahl = id;
  }
  if (phase === 'ende') {
    if (S.live) S.doc.moebel = S.doc.moebel.map(m => (m.id === id ? S.live : m));
    S.live = null; S.seiten = null;
    schrittMachen();
  }
  zeichnePlan();
}

function aendereMoebel(id, f, { schritt: mitSchritt = true } = {}) {
  S.doc.moebel = S.doc.moebel.map(m => (m.id === id ? f(m) : m));
  if (mitSchritt) schrittMachen(); else sichern();
  zeichnePlan();
}

function zurueck() { S.verlauf = rueckgaengig(S.verlauf); nachVerlauf(); }
function vor() { S.verlauf = wiederholen(S.verlauf); nachVerlauf(); }
function nachVerlauf() {
  Object.assign(S.doc, kopie(S.verlauf.jetzt)); S.raumCache = null; sichern();
  if (S.auswahl && !S.doc.moebel.some(m => m.id === S.auswahl)) { S.auswahl = null; schliesseBlatt(); }
  zeichnePlan();
}

/* ---------- Möbel-Sheet ---------- */
function moebelBlatt(id) {
  const m = () => S.doc.moebel.find(x => x.id === id);
  if (!m()) return;
  const name = h('input', { type: 'text', value: m().name, 'aria-label': 'Name', onchange: e => aendereMoebel(id, x => ({ ...x, name: e.target.value.trim() || x.name })) });
  const masse = ['b', 't', 'h'].map((k, i) => {
    const feld = cmFeld(m()[k], v => { if (v > 0.01) aendereMoebel(id, x => setzeMasse(x, { [k]: v }), { schritt: false }); }, { label: ['Breite', 'Tiefe', 'Höhe'][i], beiEnde: () => schrittMachen() });
    return { k, feld, el: h('label', h('small', ['Breite', 'Tiefe', 'Höhe'][i]), feld) };
  });
  const winkel = h('output');
  const regler = h('input', { type: 'range', min: 0, max: 359, step: 1, 'aria-label': 'Frei drehen',
    oninput: e => aendereMoebel(id, x => dreheFrei(x, +e.target.value), { schritt: false }), onchange: () => schrittMachen() });
  const seite = schalter(m().ausrichtung === 'seite', an => aendereMoebel(id, x => ({ ...x, ausrichtung: an ? 'seite' : undefined })), 'Seite an die Wand');
  const aktion = (symbol, text, klick, rot = false) => h('button.aktion' + (rot ? '.rot' : ''), { onclick: klick }, ico(symbol), h('span', text));
  const inhalt = h('div',
    h('div.blatt-kopf', name, h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => tippen(null) }, ico('x'))),
    h('div.inhalt',
      h('div.abschnitt', h('div.masse3', masse.map(x => x.el))),
      h('div.abschnitt', h('div.liste',
        h('div.dreh',
          h('button.rund', { 'aria-label': '15° nach links', onclick: () => aendereMoebel(id, x => drehe(x, -1)) }, ico('links15')),
          h('div.drehmitte', winkel, regler),
          h('button.rund', { 'aria-label': '15° nach rechts', onclick: () => aendereMoebel(id, x => drehe(x, 1)) }, ico('rechts15'))),
        h('div.zeile', h('span.haupt', h('b', 'Seite an die Wand')), seite))),
      h('div.aktionen',
        aktion('kopie', 'Duplizieren', () => { const k = dupliziere(m(), raumVon(S.doc)); S.doc.moebel.push(k); schrittMachen(); tippen(k.id); }),
        aktion('tausch', 'Ersetzen', () => katalogBlatt(id)),
        aktion('muell', 'Löschen', () => { S.doc.moebel = S.doc.moebel.filter(x => x.id !== id); S.auswahl = null; schrittMachen(); schliesseBlatt(); zeichnePlan(); }, true))));
  const { blatt } = oeffneBlatt(inhalt, { durchsichtig: true, beiSchliessen: () => { P.blattAktualisieren = null; P.leiste.classList.remove('weg'); if (S.auswahl === id) { S.auswahl = null; zeichnePlan(); } } });
  P.leiste.classList.add('weg');
  P.blattAktualisieren = () => {
    const x = m(); if (!x) return;
    winkel.textContent = `${Math.round(x.winkel)}°`;
    regler.value = Math.round(x.winkel); regler.style.setProperty('--p', `${(x.winkel / 359) * 100}%`);
    for (const { k, feld } of masse) { const inp = feld.querySelector('input'); if (document.activeElement !== inp) inp.value = Math.round(x[k] * 1000) / 10; }
  };
  P.blattAktualisieren();
  setTimeout(() => P.plan.sichtbarMachen(m(), blatt.offsetHeight + 10), 80);
}

/* ---------- Katalog ---------- */
function katalogBlatt(ersetzeId = null) {
  let kat = null, text = '';
  const liste = h('div');
  const zeichneListe = () => {
    const treffer = suche(text, kat);
    const zeilen = treffer.map(v => h('button.zeile.mit-ico', { onclick: () => waehle(v) }, mini(v), h('span.haupt', h('b', v.name), h('small', `${Math.round(v.b * 100)} × ${Math.round(v.t * 100)} × ${Math.round(v.h * 100)} cm`))));
    liste.replaceChildren(
      !ersetzeId && !text && !kat ? h('div.abschnitt', h('div.liste', h('button.zeile.mit-ico', { onclick: () => waehle(EIGENES) }, h('span.kachel', ico('kasten')), h('span.haupt', h('b', 'Eigenes Möbel'), h('small', 'Kasten mit eigenen Maßen'))))) : null,
      h('div.abschnitt', zeilen.length ? h('div.liste', zeilen) : h('p.fuss', 'Nichts gefunden')),
      h('div.abschnitt', h('h3', 'Kommt noch'), h('div.liste',
        h('div.zeile.aus.mit-ico', h('span.kachel.grau', ico('wolke')), h('span.haupt', h('b', 'Modelle von Poly Haven'), h('small', 'Freie 3D-Modelle mit echten Maßen'))),
        h('div.zeile.aus.mit-ico', h('span.kachel.grau', ico('kasten')), h('span.haupt', h('b', 'Eigenes 3D-Modell laden'), h('small', 'GLB oder USDZ'))),
        h('div.zeile.aus.mit-ico', h('span.kachel.grau', ico('link')), h('span.haupt', h('b', 'Von IKEA'), h('small', 'Produktlink einfügen'))))));
  };
  const chips = h('div.chips.scroll');
  const zeichneChips = () => chips.replaceChildren(...[[null, 'Alle'], ...KATEGORIEN].map(([k, t]) => h('button.chip' + (kat === k ? '.an' : ''), { type: 'button', onclick: () => { kat = k; zeichneChips(); zeichneListe(); } }, t)));
  const inhalt = h('div',
    h('div.blatt-kopf', h('h2', ersetzeId ? 'Ersetzen durch …' : 'Möbel'), h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => schliesseBlatt() }, ico('x'))),
    h('div.inhalt',
      h('label.suche', ico('lupe'), h('input', { type: 'search', placeholder: 'Suchen', 'aria-label': 'Suchen', oninput: e => { text = e.target.value; zeichneListe(); } })),
      chips, liste));
  inhalt.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1';
  inhalt.querySelector('.inhalt').style.cssText = 'overflow-y:auto;flex:1';
  zeichneChips(); zeichneListe();
  oeffneBlatt(inhalt, { hoch: true });

  function waehle(v) {
    const vorlage = { ...v, modell: v.id?.startsWith('kasten:') ? null : v.id };
    if (ersetzeId) {
      const alt = S.doc.moebel.find(x => x.id === ersetzeId);
      const { moebel, unterschied } = ersetze(alt, vorlage);
      S.doc.moebel = S.doc.moebel.map(x => (x.id === ersetzeId ? moebel : x));
      schrittMachen(); schliesseBlatt(true);
      hinweis(unterschied.join(' · '));
      tippen(ersetzeId);
      return;
    }
    const m = stelleAuf(vorlage, P.plan.mitte(), raumVon(S.doc));
    S.doc.moebel.push(m); S.auswahl = m.id;
    schrittMachen(); schliesseBlatt(true); zeichnePlan();
    if (v === EIGENES) tippen(m.id);
  }
}

function mini(v) {
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), k = 24 / Math.max(v.b, v.t, 0.5);
  s.setAttribute('viewBox', '0 0 30 30'); s.setAttribute('class', 'mini');
  const r = document.createElementNS(ns, 'rect');
  Object.entries({ x: 15 - v.b * k / 2, y: 15 - v.t * k / 2, width: v.b * k, height: v.t * k, rx: 2 }).forEach(([a, b]) => r.setAttribute(a, b));
  s.append(r);
  return s;
}

/* ---------- Mehr ---------- */
function mehrBlatt() {
  let sicher = false;
  const loeschen = h('button.zeile.rot.mit-ico', { onclick: async () => {
    if (!sicher) { sicher = true; loeschen.querySelector('b').textContent = 'Wirklich löschen?'; return; }
    await loescheRaum(S.doc.id); schliesseBlatt(true); zeigeStart();
  } }, ico('muell'), h('span.haupt', h('b', 'Raum löschen')));
  oeffneBlatt(h('div',
    h('div.blatt-kopf', h('h2', S.doc.name || 'Raum'), h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => schliesseBlatt() }, ico('x'))),
    h('div.inhalt', h('div.abschnitt', h('div.liste',
      h('button.zeile.akzent.mit-ico', { onclick: () => { schliesseBlatt(true); zeigeMessen(S.doc, 'vor'); } }, ico('stift'), h('span.haupt', h('b', 'Maße des Raums ändern'))),
      h('button.zeile.akzent.mit-ico', { onclick: exportieren }, ico('teilen'), h('span.haupt', h('b', 'Als Datei sichern'), h('small', 'Zum Öffnen auf einem anderen Gerät'))),
      loeschen)))));
}

async function exportieren() {
  const daten = JSON.stringify({ format: 'raumplaner-raum', version: 1, raum: kopie(S.doc) }, null, 1);
  const name = `${(S.doc.name || 'Raum').replace(/[^\wäöüÄÖÜß -]/g, '')}.raumplan.json`;
  const datei = new File([daten], name, { type: 'application/json' });
  // iPhone: Teilen-Blatt („In Dateien sichern“, AirDrop); am Mac normaler Download
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(datei), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Tastatur am Mac ---------- */
addEventListener('keydown', e => {
  if (!P || S.schirm !== P.schirm || e.target.matches('input')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? vor() : zurueck(); }
  if (S.auswahl && (e.key === 'Backspace' || e.key === 'Delete')) { S.doc.moebel = S.doc.moebel.filter(x => x.id !== S.auswahl); S.auswahl = null; schrittMachen(); schliesseBlatt(); zeichnePlan(); }
  if (S.auswahl && (e.key === 'r' || e.key === 'R')) aendereMoebel(S.auswahl, x => drehe(x, e.shiftKey ? -1 : 1));
  if (e.key === 'Escape') tippen(null);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { P?.drei?.farbenNeu(); zeichnePlan(); });

/* ---------- Start ---------- */
(async () => {
  const id = decodeURIComponent((location.hash.match(/raum=([^&]+)/) || [])[1] || '');
  const doc = id ? await ladeRaum(id) : null;
  if (doc) oeffneRaum(doc, 'ohne'); else zeigeStart('ohne');
  if (blattOffen()) schliesseBlatt(true);
})();

