// Text einer Kleinanzeige (oder jeder anderen Möbel-Anzeige) lesen: Name, Maße, Kategorie.
// Ergebnis in Metern. Was nicht sicher erkannt wurde, steht in `fehlt` bzw. `geraten`, damit die Oberfläche
// genau dort nachfragt. Kein Netz, kein Server – nur der eingefügte Text.

const ZAHL = String.raw`(\d+(?:[.,]\d+)?)`;
// nach der Zahl kein Buchstabe – außer dem „x“ einer Maßkette („80x78“)
const EINHEIT = String.raw`\s*(mm|cm|m)?(?![a-wyzäöüß])`;
const KEIN_WORT = String.raw`(?<![a-zäöüß])`;

/** Kategorie aus Stichwörtern (wie im Katalog). Teile von Wörtern zählen: „Doppelbett“, „Couchtisch“. */
const KATEGORIEN = [
  ['bett', /(bett|boxspring|matratze|schlafsofa)/g],
  ['sofa', /(sofa|couch|sessel|wohnlandschaft|récamiere|recamiere|hocker|ottomane)/g],
  ['tisch', /(tisch|sekretär|konsole)/g],
  ['stuhl', /(stuhl|stühle)/g],
  ['schrank', /(schrank|kommode|sideboard|vitrine|highboard|lowboard|tv-bank|anrichte|garderobe)/g],
  ['regal', /(regal|kallax|billy)/g]
];
/**
 * Bei zusammengesetzten Wörtern entscheidet das letzte Teil („Couchtisch“ ist ein Tisch, „Schlafsofa“ ein Bett):
 * gewonnen hat das Stichwort, das im Titel am weitesten hinten endet; ohne Treffer im Titel der ganze Text.
 */
function kategorieAus(titel, text) {
  for (const t of [titel, text]) {
    let best = null;
    for (const [k, re] of KATEGORIEN) for (const m of t.matchAll(re)) {
      const ende = m.index + m[0].length, wortEnde = t.slice(ende).search(/[^a-zäöüß]|$/) + ende;
      // „Doppelbett“: Ende des ganzen Wortes zählt, damit „Bettsofa“ als Sofa durchgeht
      const punkte = wortEnde === ende ? ende + 1000 : ende;
      if (!best || punkte > best.punkte) best = { k, punkte };
    }
    if (best) return best.k;
  }
  return 'sonst';
}
/** Übliche Höhe, falls die Anzeige keine nennt (wird als geraten markiert). */
const HOEHE = { bett: 0.45, sofa: 0.85, tisch: 0.75, stuhl: 0.85, schrank: 1.0, regal: 1.8, sonst: 0.8 };

function inMeter(text, einheit, mmWahrscheinlich = false) {
  const v = Number(String(text).replace(',', '.'));
  if (!isFinite(v)) return null;
  if (einheit === 'mm') return v / 1000;
  if (einheit === 'm') return v;
  if (einheit === 'cm') return v / 100;
  // ohne Einheit: kleine Kommazahlen sind Meter („2,10“), große Zahlen ohne Komma Millimeter nur wenn sehr groß
  if (v <= 6 && /[.,]/.test(text)) return v;
  if (mmWahrscheinlich || v > 600) return v / 1000;
  return v / 100;
}
const plausibel = v => v != null && v >= 0.05 && v <= 6;

/** Buchstaben vor einer Maßkette („B x T x H“, „L/B/H“, „BxHxT“) → Reihenfolge als ['b','t','h']. */
function reihenfolge(vorher) {
  const m = vorher.match(/(?:^|[^a-zäöüß])([lbthd])\s*[x×*\/]\s*([lbthd])(?:\s*[x×*\/]\s*([lbthd]))?\s*[:=(]?\s*(?:in\s*cm\s*)?[:=)]?\s*$/i);
  if (!m) return null;
  const buchst = m.slice(1).filter(Boolean).map(x => x.toLowerCase());
  const hatL = buchst.includes('l');
  return buchst.map(x => (x === 'l' ? 'b' : x === 'b' ? (hatL ? 't' : 'b') : x === 'd' ? 't' : x));
}

/**
 * @param {string} text eingefügter Anzeigentext
 * @returns {{ name: string, kategorie: string, b: number|null, t: number|null, h: number|null, fehlt: string[], geraten: string[] }}
 */
export function leseAnzeige(text) {
  const roh = String(text || '').replace(/ /g, ' ');
  const klein = roh.toLowerCase();
  const mm = /\bmm\b/.test(klein) && !/\bcm\b/.test(klein);
  const masse = {}, geraten = new Set();
  const setze = (k, v, sicher = true) => { if (masse[k] == null && plausibel(v)) { masse[k] = v; if (!sicher) geraten.add(k); } };

  // 1. beschriftete Einzelmaße: „Breite: 210 cm“, „Tiefe 90cm“, „Höhe ca. 0,8 m“ (nicht Sitzhöhe, Liegefläche …)
  const label = { breite: 'b', länge: 'b', laenge: 'b', tiefe: 't', höhe: 'h', hoehe: 'h' };
  const einzel = new RegExp(`${KEIN_WORT}(breite|länge|laenge|tiefe|höhe|hoehe)\\s*(?:gesamt)?\\s*[:=]?\\s*(?:ca\\.?|circa|etwa|~)?\\s*${ZAHL}${EINHEIT}`, 'giu');
  const gefunden = [...klein.matchAll(einzel)];
  const hatBreite = gefunden.some(x => x[1] === 'breite');
  for (const x of gefunden) {
    let k = label[x[1]];
    if ((x[1] === 'länge' || x[1] === 'laenge') && hatBreite) k = 'b';
    if (x[1] === 'breite' && gefunden.some(y => y[1] === 'länge' || y[1] === 'laenge') && !gefunden.some(y => y[1] === 'tiefe')) k = 't';
    setze(k, inMeter(x[2], x[3], mm));
  }

  // 2. Durchmesser: rund → Breite = Tiefe
  const rund = klein.match(new RegExp(`(?:ø|⌀|durchmesser)\\s*[:=]?\\s*(?:ca\\.?\\s*)?${ZAHL}${EINHEIT}`, 'u'));
  if (rund) { const d = inMeter(rund[1], rund[2], mm); setze('b', d); setze('t', d); }

  // 3. Maßketten „210 x 90 x 80 cm“, mit oder ohne „B x T x H“ davor
  const kette = new RegExp(`${ZAHL}${EINHEIT}\\s*[x×*\\/]\\s*${ZAHL}${EINHEIT}(?:\\s*[x×*\\/]\\s*${ZAHL}${EINHEIT})?`, 'giu');
  for (const x of klein.matchAll(kette)) {
    const werte = [[x[1], x[2]], [x[3], x[4]], [x[5], x[6]]].filter(w => w[0]);
    const einheit = x[6] || x[4] || x[2];
    const vorher = klein.slice(Math.max(0, x.index - 30), x.index);
    if (/(liege|matratze|sitz|innen)[a-zäöüß]*\s*[:=]?\s*(?:ca\.?\s*)?$/.test(vorher) && werte.length === 2 && !/bett/.test(klein)) continue;
    const ordnung = reihenfolge(vorher);
    const m = werte.map(w => inMeter(w[0], w[1] || einheit, mm));
    if (werte.length === 3) {
      const o = ordnung?.length === 3 ? ordnung : ['b', 't', 'h'];
      o.forEach((k, i) => setze(k, m[i], !!ordnung));
    } else if (/bett|matratze|boxspring/.test(klein)) {
      // Liegefläche 140 × 200: Bett ist etwas größer als die Matratze (Rahmen), das bleibt geraten
      setze('b', Math.min(...m) + 0.06, false); setze('t', Math.max(...m) + 0.08, false);
    } else {
      const o = ordnung?.length === 2 ? ordnung : ['b', 't'];
      o.forEach((k, i) => setze(k, m[i], !!ordnung));
    }
  }

  const name = nameAus(roh);
  const kategorie = kategorieAus(name.toLowerCase(), klein);
  if (masse.h == null && (masse.b != null || masse.t != null)) { masse.h = HOEHE[kategorie]; geraten.add('h'); }
  const fehlt = ['b', 't', 'h'].filter(k => masse[k] == null);
  return { name, kategorie, b: masse.b ?? null, t: masse.t ?? null, h: masse.h ?? null, fehlt, geraten: [...geraten] };
}

/** Erste sinnvolle Zeile als Name: ohne Preis, ohne „Kleinanzeigen“, gekürzt. */
function nameAus(text) {
  for (let zeile of text.split(/\r?\n/)) {
    zeile = zeile.replace(/\s*[|–-]\s*(ebay\s*)?kleinanzeigen.*$/i, '').replace(/\s+/g, ' ').trim();
    if (!zeile || /^(\d[\d.,\s]*\s*€|€|vb\b|preis|zu verschenken|beschreibung|details)/i.test(zeile)) continue;
    if (/^https?:\/\//i.test(zeile)) continue;
    return zeile.length > 48 ? zeile.slice(0, 47).trimEnd() + '…' : zeile;
  }
  return 'Möbel aus Anzeige';
}
