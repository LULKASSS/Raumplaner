// Raumplaner – Oberfläche. Ein Zustand S, drei Schirme: Start, Ausmessen, Planen.
// Rechnen (Raum aus Maßen, Einrasten, Überschneidung) kommt aus src/kern/, Zeichnen aus grundriss.js / ansicht3d.js.

import { h, ico, segment, schalter, cmFeld, oeffneBlatt, schliesseBlatt, blattOffen, hinweis } from './ui.js';
import { alleRaeume, ladeRaum, speichereRaum, loescheRaum, nurImSpeicher, ladeModellDaten, speichereModell } from './speicher.js';
import { KATEGORIEN, EIGENES, alleVorlagen, filtere } from './katalog.js';
import { TESTRAUM } from './testraum.js';
import { erstelleGrundriss } from './grundriss.js';
import { raumAusMassen, pruefeMessung, gegenprobe, ecken, wandKette, STANDARD, ELEMENT_NAMEN } from '../kern/ausmessen.js';
import { raumMasse } from '../kern/raum.js';
import { zieheAuf, ueberschneidungen, drehe, dreheFrei, setzeMasse, ersetze, dupliziere, stelleAuf, neueId } from '../kern/platzieren.js';
import { neuerVerlauf, schritt, rueckgaengig, wiederholen, kannZurueck, kannVor } from '../kern/verlauf.js';
import { raumText, cm } from '../kern/format.js';
import { leseAnzeige } from '../kern/anzeige.js';

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
    for (const m of roh.modelle || []) if (!(await ladeModellDaten(m.id))) await speichereModell({ ...m, daten: ausBase64(m.daten) });
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
      P.drei = erstelle3D(P.dreiEl, { beiTippen: tippen, beiZiehen: ziehen, beiFehler: t => hinweis(t) });
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
    h('div.blatt-kopf', m().foto ? h('img.foto-klein', { src: m().foto, alt: '' }) : null, name, h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => tippen(null) }, ico('x'))),
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
  let kat = null, text = '', vorlagen = [];
  const liste = h('div');
  const datei = h('input', { type: 'file', accept: '.glb,.usdz,model/gltf-binary,model/vnd.usdz+zip', class: 'versteckt', 'aria-label': 'Eigenes 3D-Modell',
    onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) eigenesModellBlatt(f, ersetzeId); } });
  const masseText = v => `${Math.round(v.b * 100)} × ${Math.round(v.t * 100)} × ${Math.round(v.h * 100)} cm`;
  const bild = v => v.vorschau ? h('img.vorschau', { src: v.vorschau, alt: '', loading: 'lazy' }) : h('span.kachel.grau', ico('kasten'));
  const zeichneListe = () => {
    const treffer = filtere(vorlagen, text, kat);
    const zeilen = treffer.map(v => h('button.zeile.mit-bild', { onclick: () => waehle(v) }, bild(v),
      h('span.haupt', h('b', v.name), h('small', v.quelle === 'eigen' ? `Eigenes Modell · ${masseText(v)}` : `${masseText(v)} · ${v.quelle}`))));
    const oben = !text && (!kat || kat === 'eigen');
    liste.replaceChildren(
      oben ? h('div.abschnitt', h('div.liste',
        h('button.zeile.mit-ico', { onclick: () => datei.click() }, h('span.kachel', ico('kasten')), h('span.haupt', h('b', 'Eigenes 3D-Modell laden'), h('small', 'GLB oder USDZ, z. B. rundum fotografiert'))),
        h('button.zeile.mit-ico', { onclick: () => anzeigeBlatt(ersetzeId) }, h('span.kachel', ico('link')), h('span.haupt', h('b', 'Aus einer Anzeige'), h('small', 'Text einfügen, z. B. von Kleinanzeigen'))),
        !ersetzeId && h('button.zeile.mit-ico', { onclick: () => waehle(EIGENES) }, h('span.kachel', ico('lineal')), h('span.haupt', h('b', 'Kasten mit eigenen Maßen'), h('small', 'Für alles, was es nicht als Modell gibt'))))) : null,
      h('div.abschnitt', zeilen.length ? h('div.liste', zeilen) : h('p.fuss', vorlagen.length ? 'Nichts gefunden' : 'Katalog lädt …')),
      h('div.abschnitt', h('h3', 'Kommt noch'), h('div.liste',
        h('div.zeile.aus.mit-ico', h('span.kachel.grau', ico('link')), h('span.haupt', h('b', 'Von IKEA'), h('small', 'Produktlink einfügen'))))),
      h('p.fuss.quellen', 'Modelle von Poly Haven und Kenney, frei nutzbar (CC0).'));
  };
  const chips = h('div.chips.scroll');
  const zeichneChips = () => chips.replaceChildren(...[[null, 'Alle'], ...KATEGORIEN].map(([k, t]) => h('button.chip' + (kat === k ? '.an' : ''), { type: 'button', onclick: () => { kat = k; zeichneChips(); zeichneListe(); } }, t)));
  const inhalt = h('div',
    h('div.blatt-kopf', h('h2', ersetzeId ? 'Ersetzen durch …' : 'Möbel'), h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => schliesseBlatt() }, ico('x'))),
    h('div.inhalt',
      h('label.suche', ico('lupe'), h('input', { type: 'search', placeholder: 'Suchen', 'aria-label': 'Suchen', oninput: e => { text = e.target.value; zeichneListe(); } })),
      chips, liste, datei));
  zeichneChips(); zeichneListe();
  oeffneBlatt(inhalt, { hoch: true });
  alleVorlagen().then(l => { vorlagen = l; zeichneListe(); });

  function waehle(v) { setzeVorlage(v, ersetzeId); }
}

/** Vorlage in den Raum stellen oder ein Möbel damit ersetzen. */
function setzeVorlage(v, ersetzeId = null) {
  const vorlage = { name: v.name, kategorie: v.kategorie, b: v.b, t: v.t, h: v.h, quelle: ['eigen', 'anzeige'].includes(v.quelle) ? v.quelle : 'katalog', modell: v.modell ?? null };
  const mitFoto = m => { const n = { ...m }; if (v.foto) n.foto = v.foto; else delete n.foto; return n; };
  if (ersetzeId) {
    const alt = S.doc.moebel.find(x => x.id === ersetzeId);
    const { moebel: ersetzt, unterschied } = ersetze(alt, vorlage), moebel = mitFoto(ersetzt);
    S.doc.moebel = S.doc.moebel.map(x => (x.id === ersetzeId ? moebel : x));
    schrittMachen(); schliesseBlatt(true);
    hinweis(unterschied.join(' · '));
    tippen(ersetzeId);
    return;
  }
  // Grundriss: Mitte des sichtbaren Ausschnitts; in 3D (Grundriss verborgen) die Raummitte. Der Kern sucht von dort einen freien Platz im Raum.
  const start = S.modus === 'grundriss' ? P.plan.mitte() : { x: 0, z: 0 };
  const m = mitFoto(stelleAuf(vorlage, start, raumVon(S.doc)));
  S.doc.moebel.push(m); S.auswahl = m.id;
  schrittMachen(); schliesseBlatt(true); zeichnePlan();
  if (v === EIGENES) tippen(m.id);
}

/* ---------- Aus einer Anzeige: Text einfügen, Name und Maße erkennen, optional ein Foto, als Kasten in echter Größe ---------- */
function anzeigeBlatt(ersetzeId = null) {
  const werte = { name: '', kategorie: 'sonst', b: null, t: null, h: null };
  let geraten = new Set(), foto = null;
  const name = h('input.text', { type: 'text', placeholder: 'Name', 'aria-label': 'Name', oninput: e => { werte.name = e.target.value; } });
  const felder = {}, label = { b: 'Breite', t: 'Tiefe', h: 'Höhe' };
  const masse = h('div.masse3', ['b', 't', 'h'].map(k => {
    felder[k] = cmFeld(null, v => { werte[k] = v; geraten.delete(k); pruefen(); }, { label: label[k] });
    return h('label', h('small', label[k]), felder[k]);
  }));
  const hinweisZeile = h('p.fuss');
  const knopf = h('button.knopf', { onclick: uebernehmen }, ersetzeId ? 'Damit ersetzen' : 'In den Raum stellen');
  const text = h('textarea.anzeige', { rows: 6, placeholder: 'Titel und Beschreibung der Anzeige hier einfügen', 'aria-label': 'Anzeigentext', oninput: lesen });
  const bild = h('img.foto', { alt: 'Foto aus der Anzeige', hidden: true });
  const fotoDatei = h('input', { type: 'file', accept: 'image/*', class: 'versteckt', 'aria-label': 'Foto aus der Anzeige', onchange: async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { foto = await verkleinern(f, 512); bild.src = foto; bild.hidden = false; fotoKnopf.querySelector('b').textContent = 'Anderes Foto'; entfernen.hidden = false; }
    catch { hinweis('Das Foto lässt sich nicht lesen'); }
  } });
  const fotoKnopf = h('button.zeile.akzent', { type: 'button', onclick: () => fotoDatei.click() }, h('span.haupt', h('b', 'Foto dazu (optional)')));
  const entfernen = h('button.zeile.rot', { type: 'button', hidden: true, onclick: () => { foto = null; bild.hidden = true; entfernen.hidden = true; fotoKnopf.querySelector('b').textContent = 'Foto dazu (optional)'; } }, h('span.haupt', h('b', 'Foto entfernen')));

  function lesen() {
    const a = leseAnzeige(text.value);
    werte.kategorie = a.kategorie;
    if (!name.dataset.selbst) { werte.name = text.value.trim() ? a.name : ''; name.value = werte.name; }
    for (const k of ['b', 't', 'h']) {
      werte[k] = a[k];
      felder[k].querySelector('input').value = a[k] ? String(Math.round(a[k] * 1000) / 10).replace('.', ',') : '';
    }
    geraten = new Set(a.geraten);
    pruefen();
  }
  function pruefen() {
    const fehlt = ['b', 't', 'h'].filter(k => !(werte[k] > 0));
    knopf.disabled = fehlt.length > 0;
    for (const k of ['b', 't', 'h']) felder[k].closest('label').classList.toggle('pruefen', fehlt.includes(k) || geraten.has(k));
    hinweisZeile.className = 'fuss' + (fehlt.length ? ' rot' : '');
    hinweisZeile.textContent = !text.value.trim() ? '' : fehlt.length ? `${fehlt.map(k => label[k]).join(', ')} nicht gefunden – bitte eintippen.`
      : geraten.size ? `${[...geraten].map(k => label[k]).join(', ')} geschätzt – bitte prüfen.` : 'Maße aus der Anzeige übernommen.';
  }
  function uebernehmen() {
    if (knopf.disabled) return;
    setzeVorlage({ name: werte.name.trim() || 'Möbel aus Anzeige', kategorie: werte.kategorie, b: werte.b, t: werte.t, h: werte.h, quelle: 'anzeige', foto }, ersetzeId);
  }
  name.addEventListener('input', () => { name.dataset.selbst = '1'; });

  const zwischenablage = navigator.clipboard?.readText
    ? h('button.chip', { type: 'button', onclick: async () => { try { text.value = await navigator.clipboard.readText(); lesen(); } catch { text.focus(); } } }, 'Aus der Zwischenablage einfügen')
    : null;
  oeffneBlatt(h('div',
    h('div.blatt-kopf', h('h2', 'Aus einer Anzeige'), h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => schliesseBlatt() }, ico('x'))),
    h('div.inhalt',
      h('div.abschnitt', text, zwischenablage && h('div.chips', { style: 'margin-top:10px' }, zwischenablage)),
      h('div.abschnitt', h('h3', 'Erkannt'), h('div.liste', h('label.zeile', name)), h('div', { style: 'height:10px' }), masse, hinweisZeile),
      h('div.abschnitt', h('div.liste', fotoKnopf, entfernen), bild, fotoDatei),
      knopf)), { hoch: true });
  pruefen();
}

/** Foto auf höchstens `max` px verkleinern, als JPEG-Daten-URL (bleibt im Raum gespeichert). */
async function verkleinern(datei, max) {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // durchsichtige PNGs nicht schwarz werden lassen
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- Eigenes 3D-Modell: auf den Boden, Vorderseite festlegen, auf echte Breite bringen ---------- */
async function eigenesModellBlatt(datei, ersetzeId) {
  if (datei.size > 80e6) { hinweis('Die Datei ist größer als 80 MB'); return; }
  const [M, THREE] = await Promise.all([import('./modelle.js'), import('three')]);
  const puffer = await datei.arrayBuffer(), art = M.dateiArt(puffer);
  let objekt;
  try { objekt = await M.parse(puffer, art); } catch (e) { hinweis(e.message || 'Modell lässt sich nicht lesen'); return; }
  M.texturenBegrenzen(objekt);

  // faktor: Maßstab Modell → echte Größe. Drehen ändert ihn nicht (das Möbel wird ja nicht größer)
  let drehung = 0, roh = null, faktor = null;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const szene = new THREE.Scene(), kamera = new THREE.PerspectiveCamera(30, 1, 0.01, 500);
  szene.add(new THREE.HemisphereLight(0xffffff, 0x8e8c9a, 2.2));
  const sonne = new THREE.DirectionalLight(0xffffff, 1.6); sonne.position.set(2, 4, 3); szene.add(sonne);
  // Pfeil auf dem Boden: zeigt, wo vorne ist
  const pfeil = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([[-0.5, 0], [0.5, 0], [0, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)))),
    new THREE.MeshBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), side: THREE.DoubleSide }));
  pfeil.rotation.x = -Math.PI / 2;
  szene.add(pfeil);
  let gruppe = null;

  const vorschau = h('div.modell-vorschau', renderer.domElement);
  const name = h('input.text', { type: 'text', value: datei.name.replace(/\.(glb|usdz)$/i, ''), 'aria-label': 'Name des Modells' });
  const tiefe = h('output'), hoehe = h('output'), warnung = h('p.fuss');
  const breiteFeld = cmFeld(null, v => { if (v > 0) { faktor = v / roh.b; masse(false); } }, { label: 'Breite' });

  function aufbauen() {
    if (gruppe) szene.remove(gruppe);
    const n = M.normalisiere(objekt, drehung);
    gruppe = n.gruppe; roh = n.masse; szene.add(gruppe);
    faktor ??= 1;
    masse(true);
  }
  function masse(feldNeu) {
    const k = faktor;
    if (feldNeu) breiteFeld.querySelector('input').value = String(Math.round(roh.b * k * 1000) / 10).replace('.', ',');
    gruppe.scale.setScalar(k);
    tiefe.textContent = Math.round(roh.t * k * 100); hoehe.textContent = Math.round(roh.h * k * 100);
    const gross = Math.max(roh.b, roh.t, roh.h) * k;
    warnung.textContent = gross > 8 || gross < 0.05 ? 'Die Maße wirken nicht echt – trag die Breite ein, die du gemessen hast.' : '';
    // Kamera schräg von vorn, Pfeil vor die Vorderseite
    const r = Math.hypot(roh.b, roh.t, roh.h) * k / 2, abstand = r / Math.sin(THREE.MathUtils.degToRad(15));
    pfeil.scale.setScalar(Math.max(0.15, r * 0.35)); pfeil.position.set(0, 0.002, roh.t * k / 2 + r * 0.15);
    kamera.position.set(0, roh.h * k / 2, 0).addScaledVector(new THREE.Vector3(0.55, 0.5, 1).normalize(), abstand);
    kamera.lookAt(0, roh.h * k / 2, 0); kamera.far = abstand * 4; kamera.updateProjectionMatrix();
    zeichne();
  }
  function zeichne() {
    const w = vorschau.clientWidth || 300, hh = vorschau.clientHeight || 220;
    renderer.setSize(w, hh, false); kamera.aspect = w / hh; kamera.updateProjectionMatrix();
    renderer.render(szene, kamera);
  }

  async function uebernehmen() {
    const k = faktor;
    const eintrag = { id: neueId(), name: name.value.trim() || 'Eigenes Modell', art, daten: puffer, drehung, b: roh.b * k, t: roh.t * k, h: roh.h * k,
      vorschau: renderer.domElement.toDataURL('image/png') };
    try { await speichereModell(eintrag); } catch { hinweis('Speichern hat nicht geklappt – ist der Speicher voll?'); return; }
    renderer.dispose();
    setzeVorlage({ ...eintrag, kategorie: 'eigen', quelle: 'eigen', modell: 'eigen:' + eintrag.id }, ersetzeId);
  }

  const inhalt = h('div',
    h('div.blatt-kopf', name, h('button.schliessen', { 'aria-label': 'Schließen', onclick: () => schliesseBlatt() }, ico('x'))),
    h('div.inhalt',
      h('div.abschnitt', vorschau),
      h('div.abschnitt', h('div.liste',
        h('div.zeile', h('span.haupt', h('b', 'Vorderseite')),
          h('button.rund', { type: 'button', 'aria-label': 'Vorderseite 90° nach links', onclick: () => { drehung = (drehung + 90) % 360; aufbauen(); } }, ico('links15')),
          h('button.rund', { type: 'button', 'aria-label': 'Vorderseite 90° nach rechts', onclick: () => { drehung = (drehung + 270) % 360; aufbauen(); } }, ico('rechts15'))),
        h('label.zeile', h('span.haupt', h('b', 'Breite')), breiteFeld),
        h('div.zeile', h('span.haupt', h('b', 'Tiefe')), h('span.wert', tiefe, ' cm')),
        h('div.zeile', h('span.haupt', h('b', 'Höhe')), h('span.wert', hoehe, ' cm'))), warnung),
      h('button.knopf', { onclick: uebernehmen }, ersetzeId ? 'Damit ersetzen' : 'In den Raum stellen')));
  oeffneBlatt(inhalt, { hoch: true, beiSchliessen: () => renderer.dispose() });
  requestAnimationFrame(aufbauen);
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
  // eigene Modelle, die im Raum stehen, kommen mit in die Datei (sonst fehlen sie auf dem anderen Gerät)
  const ids = [...new Set(S.doc.moebel.map(m => m.modell).filter(v => v?.startsWith('eigen:')).map(v => v.slice(6)))];
  const modelle = [];
  for (const id of ids) { const d = await ladeModellDaten(id); if (d) modelle.push({ ...d, daten: zuBase64(d.daten) }); }
  const daten = JSON.stringify({ format: 'raumplaner-raum', version: 2, raum: kopie(S.doc), modelle });
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

function zuBase64(puffer) {
  const b = new Uint8Array(puffer); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function ausBase64(text) { const s = atob(text), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; }

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

