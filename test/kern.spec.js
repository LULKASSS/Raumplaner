// Rechenkern ohne Browser: Import, Maße, Einrasten, Drehen, Abstand, Überschneidung, Ersetzen, Verlauf.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { leseCapturedRoom, raumMasse, wandLaenge, innenNormale } from '../src/kern/raum.js';
import { einrasten, zieheAuf, dreheSchritt, drehe, dreheFrei, wandAbstand, seitenAbstaende, ueberschneidungen, ersetze, vergleich, setzeMasse, dupliziere, stelleAuf, grundflaeche, SCHWELLE } from '../src/kern/platzieren.js';
import { neuerVerlauf, schritt, rueckgaengig, wiederholen, kannZurueck, kannVor } from '../src/kern/verlauf.js';
import { cm, meter, quadratmeter, masse, raumText, ausZentimetern } from '../src/kern/format.js';
import { eindringtiefe, achsen } from '../src/kern/geometrie.js';

const JSON_TEXT = readFileSync(new URL('../daten/testraum.json', import.meta.url), 'utf8');
const neu = () => leseCapturedRoom(JSON_TEXT, { name: 'Testraum' });
const finde = (raum, name) => raum.moebel.find(m => m.name === name);
// Nach dem Ausrichten: Süd z = −1,8 · Nord z = 1,8 · West x = −2,1 · Ost x = 2,1
const SUED = -1.8, OST = 2.1, WEST = -2.1;
const hintenZ = m => Math.max(...grundflaeche(m).map(p => -p.z)) * -1; // kleinste z der Grundfläche

test.describe.configure({ mode: 'parallel' });

test.describe('Import CapturedRoom', () => {
  test('Wände, Höhe und Fläche stimmen trotz verdrehtem Scan', () => {
    const r = neu();
    expect(r.waende.map(w => +wandLaenge(w).toFixed(3)).sort()).toEqual([3.6, 3.6, 4.2, 4.2]);
    for (const w of r.waende) {
      expect(Math.min(Math.abs(w.a.x - w.b.x), Math.abs(w.a.z - w.b.z))).toBeLessThan(1e-4); // achsparallel
      expect(w.hoehe).toBeCloseTo(2.5, 6);
    }
    const m = raumMasse(r);
    expect(m.breite).toBeCloseTo(4.2, 4); expect(m.tiefe).toBeCloseTo(3.6, 4);
    expect(m.flaeche).toBeCloseTo(15.12, 3); expect(m.hoehe).toBeCloseTo(2.5, 6);
    expect(raumText(m)).toBe('4,20 × 3,60 m · 15,1 m²');
  });

  test('Tür, Fenster und Möbel mit Kategorie, Maßen und Lage', () => {
    const r = neu();
    const tuer = r.oeffnungen.find(o => o.art === 'tuer'), fenster = r.oeffnungen.find(o => o.art === 'fenster');
    expect(tuer.breite).toBeCloseTo(0.88, 6); expect(tuer.unten).toBeCloseTo(0, 6); expect(tuer.x).toBeCloseTo(WEST, 4);
    expect(fenster.unten).toBeCloseTo(0.9, 4); expect(fenster.z).toBeCloseTo(1.8, 4);
    expect(r.moebel.map(m => m.name)).toEqual(['Sofa', 'Tisch', 'Stuhl', 'Schrank']);
    const sofa = finde(r, 'Sofa');
    expect(sofa.quelle).toBe('scan'); expect(sofa.kategorie).toBe('sofa');
    expect([sofa.b, sofa.t, sofa.h]).toEqual([2.1, 0.92, 0.82]);
    expect(sofa.winkel).toBeCloseTo(2, 3); expect(sofa.ueberBoden).toBe(0);
    expect(sofa.z).toBeCloseTo(SUED + 0.03 + 0.46, 4);
    expect(finde(r, 'Schrank').winkel).toBeCloseTo(270, 3);
  });

  test('Ohne Bodenfläche wird der Boden aus den Wänden gebaut', () => {
    const roh = JSON.parse(JSON_TEXT); roh.floors = [];
    expect(raumMasse(leseCapturedRoom(roh)).flaeche).toBeCloseTo(15.12, 3);
  });

  test('Matrix als vier Spalten und Kategorie als Text gehen auch', () => {
    const roh = JSON.parse(JSON_TEXT);
    for (const liste of [roh.walls, roh.objects]) for (const o of liste) o.transform = [0, 1, 2, 3].map(i => o.transform.slice(4 * i, 4 * i + 4));
    roh.objects[0].category = 'sofa';
    const r = leseCapturedRoom(roh);
    expect(r.moebel[0].name).toBe('Sofa'); expect(raumMasse(r).flaeche).toBeCloseTo(15.12, 3);
  });

  test('Kaputte Datei meldet einen klaren Fehler', () => {
    expect(() => leseCapturedRoom('{"foo":1}')).toThrow(/Keine Wände/);
    const roh = JSON.parse(JSON_TEXT); roh.walls[0].transform = [1, 2];
    expect(() => leseCapturedRoom(roh)).toThrow(/Transformationsmatrix/);
  });

  test('Innen-Normale zeigt in den Raum', () => {
    const r = neu();
    for (const w of r.waende) {
      const n = innenNormale(w, r), mitte = { x: (w.a.x + w.b.x) / 2 + n.x, z: (w.a.z + w.b.z) / 2 + n.z };
      expect(Math.abs(mitte.x) <= 2.1 && Math.abs(mitte.z) <= 1.8).toBe(true);
    }
  });
});

test.describe('Einrasten', () => {
  test('Rückseite an die Wand: dreht parallel und schließt bündig ab', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 10 };
    const { moebel, an } = zieheAuf(sofa, { x: 0, z: SUED + 0.46 + 0.08 }, r);
    expect(moebel.winkel).toBe(0);
    expect(moebel.z - moebel.t / 2).toBeCloseTo(SUED, 6);
    expect(an[0].art).toBe('wand');
  });

  test('Rückseite an die Wand, auch wenn das Möbel vorher anders herum stand', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 180 };
    const { moebel } = zieheAuf(sofa, { x: 0, z: SUED + 0.5 }, r);
    expect(moebel.winkel).toBe(0); // Vorderseite zeigt in den Raum
    const { moebel: ost } = zieheAuf(sofa, { x: OST - 0.5, z: 0 }, r);
    expect(ost.winkel).toBe(270);
    expect(ost.x + ost.t / 2).toBeCloseTo(OST, 6);
  });

  test('Außerhalb des Fangbereichs bleibt alles, wie es ist', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 10 };
    const z = SUED + 0.46 + SCHWELLE + 0.15, { moebel, an } = zieheAuf(sofa, { x: 0, z }, r);
    expect(moebel.winkel).toBe(10); expect(moebel.z).toBe(z); expect(an).toEqual([]);
  });

  test('Über die Wand hinaus gezogen: bleibt drinnen und steht an der Wand', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 0 };
    const { moebel, an } = zieheAuf(sofa, { x: 0, z: SUED - 0.7 }, r);
    expect(an[0]).toEqual({ art: 'wand', id: r.waende[0].id });
    expect(moebel.z - moebel.t / 2).toBeCloseTo(SUED, 6);
  });

  test('In die Ecke: zwei Wände gleichzeitig', () => {
    const r = neu(), sofa = finde(r, 'Sofa');
    const { moebel, an } = zieheAuf(sofa, { x: WEST + 1.05 + 0.07, z: SUED + 0.46 + 0.05 }, r);
    expect(an.filter(a => a.art === 'wand')).toHaveLength(2);
    expect(moebel.x - moebel.b / 2).toBeCloseTo(WEST, 6);
    expect(moebel.z - moebel.t / 2).toBeCloseTo(SUED, 6);
  });

  test('Seite an die Wand, wenn so gewollt (z. B. Bett)', () => {
    const r = neu(), bett = { id: 'bett', name: 'Bett', b: 1.4, t: 2.0, h: 0.5, ueberBoden: 0, winkel: 85, ausrichtung: 'seite', x: 0, z: 0 };
    const { moebel } = zieheAuf(bett, { x: 0, z: SUED + 0.7 + 0.05 }, r);
    expect([90, 270]).toContain(moebel.winkel);
    expect(moebel.z - moebel.b / 2).toBeCloseTo(SUED, 6);
  });

  test('Frei gedreht rastet nicht an der Wand ein', () => {
    const r = neu(), sofa = dreheFrei(finde(r, 'Sofa'), 22);
    const { moebel } = zieheAuf(sofa, { x: 0, z: SUED + 0.6 }, r);
    expect(moebel.winkel).toBe(22);
  });

  test('Bündig an ein anderes Möbel', () => {
    const r = neu(), tisch = finde(r, 'Tisch');
    const kommode = { id: 'kommode', name: 'Kommode', b: 0.6, t: 0.5, h: 0.8, ueberBoden: 0, winkel: 0, x: 0, z: 0 };
    // rechts neben den Tisch, 6 cm Luft
    const { moebel, an } = zieheAuf(kommode, { x: tisch.x + 0.6 + 0.3 + 0.06, z: tisch.z }, r);
    expect(an).toEqual([{ art: 'moebel', id: tisch.id }]);
    expect(moebel.x - 0.3).toBeCloseTo(tisch.x + 0.6, 6);
  });

  test('An der Wand und am Nachbarn: rückt seitlich ran, bleibt an der Wand', () => {
    const r = neu(), sofa = einrasten(finde(r, 'Sofa'), r).moebel;
    r.moebel = r.moebel.map(m => m.id === sofa.id ? sofa : m);
    const regal = { id: 'regal', name: 'Regal', b: 0.5, t: 0.35, h: 1.2, ueberBoden: 0, winkel: 0, x: 0, z: 0 };
    const { moebel, an } = zieheAuf(regal, { x: sofa.x + sofa.b / 2 + 0.25 + 0.08, z: SUED + 0.2 }, r);
    expect(an.map(a => a.art)).toEqual(['wand', 'moebel']);
    expect(moebel.z - 0.175).toBeCloseTo(SUED, 6);
    expect(moebel.x - 0.25).toBeCloseTo(sofa.x + sofa.b / 2, 6);
  });

  test('Fernseher an der Wand hängt nicht am Sofa darunter fest', () => {
    const r = neu(), sofa = finde(r, 'Sofa');
    const tv = { id: 'tv', name: 'Fernseher', b: 1.2, t: 0.08, h: 0.7, ueberBoden: 1.2, winkel: 0, x: 0, z: 0 };
    expect(zieheAuf(tv, { x: sofa.x + 0.3, z: sofa.z }, r).an.map(a => a.art)).not.toContain('moebel');
  });
});

test.describe('Drehen', () => {
  test('15°-Schritte in beide Richtungen, mit Überlauf', () => {
    expect(dreheSchritt(0, 1)).toBe(15); expect(dreheSchritt(15, 1)).toBe(30);
    expect(dreheSchritt(0, -1)).toBe(345); expect(dreheSchritt(345, 1)).toBe(0);
    expect(dreheSchritt(7, 1)).toBe(15); expect(dreheSchritt(7, -1)).toBe(0);
    let w = 0; for (let i = 0; i < 24; i++) w = dreheSchritt(w, 1); expect(w).toBe(0);
  });

  test('Freies Drehen ist die Ausnahme und wird vermerkt', () => {
    const m = { winkel: 0 };
    expect(dreheFrei(m, 22).frei).toBe(true); expect(dreheFrei(m, 45).frei).toBe(false);
    expect(drehe(dreheFrei(m, 22), 1)).toMatchObject({ winkel: 30, frei: false });
  });

  test('Drehen um die Mitte: Lage bleibt', () => {
    const m = { x: 0.4, z: -0.2, winkel: 0, b: 2, t: 1, h: 1 };
    expect(drehe(m, 1)).toMatchObject({ x: 0.4, z: -0.2, winkel: 15 });
  });
});

test.describe('Abstand zur Wand', () => {
  test('Zentimeter bis zur nächsten Wand', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 0 };
    const a = wandAbstand({ ...sofa, z: SUED + 0.46 + 0.37 }, r);
    expect(cm(a.d)).toBe('37 cm');
    expect(a.q.z).toBeCloseTo(SUED, 6);
  });

  test('Abstand jeder Seite geradeaus bis zur Wand', () => {
    const r = neu(), sofa = { ...finde(r, 'Sofa'), winkel: 0, x: 0, z: SUED + 0.46 };
    const s = Object.fromEntries(seitenAbstaende(sofa, r).map(x => [x.seite, Math.round(x.d * 100)]));
    expect(s).toEqual({ hinten: 0, vorn: 360 - 92, links: 210 - 105, rechts: 210 - 105 });
  });
});

test.describe('Überschneidung', () => {
  test('Bündig an der Wand ist keine Überschneidung, 2 cm drin schon', () => {
    const r = neu(), sofa = finde(r, 'Sofa');
    const setze = m => ({ ...r, moebel: r.moebel.map(x => x.id === sofa.id ? m : x) });
    const buendig = einrasten(sofa, r).moebel;
    expect(ueberschneidungen(setze(buendig))[sofa.id]).toBeUndefined();
    const drin = { ...buendig, z: buendig.z - 0.02 };
    expect(ueberschneidungen(setze(drin))[sofa.id]).toEqual([{ art: 'wand', id: r.waende[0].id }]);
  });

  test('Der schief gescannte Sofa-Körper ragt 6 mm in die Wand', () => {
    const r = neu();
    expect(ueberschneidungen(r)[finde(r, 'Sofa').id]?.map(x => x.art)).toEqual(['wand']);
  });

  test('Im Schwenkbereich der Tür', () => {
    const r = neu(), tuer = r.oeffnungen.find(o => o.art === 'tuer');
    const stuhl = { ...finde(r, 'Stuhl'), x: WEST + 0.5, z: tuer.z };
    r.moebel = r.moebel.map(m => m.name === 'Stuhl' ? stuhl : m);
    expect(ueberschneidungen(r)[stuhl.id]).toEqual([{ art: 'tuer', id: tuer.id }]);
    r.moebel = [{ ...stuhl, x: WEST + 0.88 + 0.3 }];
    expect(ueberschneidungen(r)[stuhl.id]).toBeUndefined();
  });

  test('Zwei Möbel übereinander, aber nicht wenn sie sich nur berühren', () => {
    const r = neu(), tisch = finde(r, 'Tisch');
    const a = { id: 'a', b: 1, t: 1, h: 1, ueberBoden: 0, winkel: 0, x: tisch.x + 0.6 + 0.5, z: tisch.z };
    r.moebel = [tisch, a];
    expect(ueberschneidungen(r)[a.id]).toBeUndefined();
    a.x -= 0.1;
    expect(ueberschneidungen(r)[a.id]).toEqual([{ art: 'moebel', id: tisch.id }]);
    expect(ueberschneidungen(r)[tisch.id]).toEqual([{ art: 'moebel', id: 'a' }]);
  });

  test('Gedrehte Rechtecke: Trennachsen stimmen', () => {
    const q = (x, z, w) => grundflaeche({ x, z, winkel: w, b: 1, t: 1 });
    expect(eindringtiefe(q(0, 0, 0), q(1.3, 0, 45))).toBe(0);           // Spitze knapp daneben (1,207)
    expect(eindringtiefe(q(0, 0, 0), q(1.1, 0, 45))).toBeGreaterThan(0.05);
  });
});

test.describe('Ersetzen und Maße', () => {
  test('Gescanntes Sofa durch Katalogmodell: Lage bleibt, Rückseite bleibt an der Wand', () => {
    const r = neu(), sofa = einrasten(finde(r, 'Sofa'), r).moebel;
    const { moebel, unterschied } = ersetze(sofa, { name: 'Sofa Nora', kategorie: 'sofa', b: 2.22, t: 0.95, h: 0.82, modell: 'katalog:sofa-nora' });
    expect(unterschied).toEqual(['12 cm breiter', '3 cm tiefer']);
    expect(moebel).toMatchObject({ id: sofa.id, x: sofa.x, winkel: sofa.winkel, name: 'Sofa Nora', quelle: 'katalog' });
    expect(moebel.z - moebel.t / 2).toBeCloseTo(SUED, 6);
    expect(moebel.scan).toEqual({ kategorie: 'sofa', b: 2.1, t: 0.92, h: 0.82 });
  });

  test('Vergleichstext in alle Richtungen', () => {
    expect(vergleich({ b: 1, t: 1, h: 1 }, { b: 0.9, t: 0.95, h: 1.2 })).toEqual(['10 cm schmaler', '5 cm weniger tief', '20 cm höher']);
    expect(vergleich({ b: 1, t: 1, h: 1 }, { b: 1.004, t: 1, h: 1 })).toEqual(['gleich groß']);
  });

  test('Maße ändern: Rückseite bleibt, auch gedreht', () => {
    const m = { x: 1, z: 0, winkel: 270, b: 0.8, t: 0.4, h: 1.8 };
    const n = setzeMasse(m, { t: 0.6 });
    expect(n.x + n.t / 2).toBeCloseTo(m.x + m.t / 2, 9); // Rückseite zeigt bei 270° nach +x
    expect(n.z).toBeCloseTo(0, 9);
  });

  test('Duplizieren legt die Kopie daneben, wo Platz ist', () => {
    const r = neu(), tisch = finde(r, 'Tisch'), kopie = dupliziere(tisch, r);
    expect(kopie.id).not.toBe(tisch.id);
    // rechts steht der Schrank, links der Stuhl → davor
    expect(kopie.x).toBeCloseTo(tisch.x, 6); expect(kopie.z).toBeCloseTo(tisch.z + tisch.t, 6); // rastet bündig an
    r.moebel.push(kopie);
    expect(ueberschneidungen(r)[kopie.id]).toBeUndefined();
  });

  test('Neues Möbel aus dem Katalog an der Wand absetzen', () => {
    const r = neu(), m = stelleAuf({ name: 'Regal', b: 0.8, t: 0.3, h: 2, quelle: 'katalog' }, { x: -1, z: 1.6 }, r);
    expect(m.winkel).toBe(180); // Nordwand: Vorderseite zeigt nach Süden
    expect(m.z + m.t / 2).toBeCloseTo(1.8, 6);
    expect(m.ueberBoden).toBe(0);
  });
});

test.describe('Verlauf und Anzeige', () => {
  test('Rückgängig und Wiederholen', () => {
    let v = neuerVerlauf({ n: 0 });
    v = schritt(v, { n: 1 }); v = schritt(v, { n: 2 });
    expect(schritt(v, { n: 2 })).toBe(v); // keine Änderung, kein Schritt
    v = rueckgaengig(v); expect(v.jetzt.n).toBe(1);
    v = rueckgaengig(v); expect(v.jetzt.n).toBe(0); expect(kannZurueck(v)).toBe(false);
    v = wiederholen(v); expect(v.jetzt.n).toBe(1);
    v = schritt(v, { n: 5 }); expect(kannVor(v)).toBe(false);
  });

  test('Deutsche Zahlen', () => {
    expect(meter(4.2)).toBe('4,20 m'); expect(quadratmeter(15.12)).toBe('15,1 m²');
    expect(masse({ b: 2.1, t: 0.92, h: 0.82 })).toBe('210 × 92 × 82 cm');
    expect(ausZentimetern('92,5')).toBeCloseTo(0.925, 9); expect(ausZentimetern('abc')).toBeNull(); expect(ausZentimetern('0')).toBeNull();
  });
});

test('Zufall: nie NaN, eingerastet an der Wand heißt nie in der Wand', () => {
  const r = neu();
  let s = 11; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const m = { id: 'z', b: 0.3 + rnd() * 2, t: 0.3 + rnd() * 1.2, h: 0.4 + rnd() * 2, ueberBoden: 0, winkel: Math.floor(rnd() * 24) * 15, x: 0, z: 0 };
    const { moebel, an, abstand, seiten } = zieheAuf(m, { x: (rnd() - 0.5) * 4, z: (rnd() - 0.5) * 3.4 }, r);
    for (const v of [moebel.x, moebel.z, moebel.winkel, abstand.d, ...seiten.map(x => x.d)]) expect(Number.isFinite(v)).toBe(true);
    if (an.some(a => a.art === 'wand')) {
      const raum = { ...r, moebel: [moebel] }, gerastet = an.filter(a => a.art === 'wand').map(a => a.id);
      expect((ueberschneidungen(raum).z ?? []).filter(x => gerastet.includes(x.id))).toEqual([]);
      const { ez } = achsen(moebel.winkel); expect(Math.abs(ez.x * ez.z)).toBeLessThan(1e-9); // parallel zu den Wänden
    }
  }
});
