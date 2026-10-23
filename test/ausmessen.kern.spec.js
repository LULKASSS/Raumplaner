// Rechenkern: Raum aus eingetippten Maßen.
import { test, expect } from '@playwright/test';
import { raumAusMassen, wandKette, gegenprobe, ecken, pruefeMessung, vorschau } from '../src/kern/ausmessen.js';
import { raumMasse, wandLaenge } from '../src/kern/raum.js';
import { zieheAuf, ueberschneidungen, schwenkbereich, grundflaeche } from '../src/kern/platzieren.js';
import { flaeche } from '../src/kern/geometrie.js';

const RECHTECK = { form: 'rechteck', laenge: 4.2, breite: 3.6, hoehe: 2.5, elemente: [] };
// L-Form: 5 × 4 m, oben rechts fehlt ein Stück 2 × 1,5 m
const L_FORM = { form: 'frei', hoehe: 2.4, elemente: [], waende: [
  { laenge: 3, knick: 'rechts' }, { laenge: 1.5, knick: 'links' }, { laenge: 2, knick: 'rechts' },
  { laenge: 2.5, knick: 'rechts' }, { laenge: 5, knick: 'rechts' }, { laenge: 4, knick: 'rechts' }
] };

test.describe.configure({ mode: 'parallel' });

test('Rechteck: Wände, Fläche, Höhe, Mitte auf 0/0', () => {
  const r = raumAusMassen(RECHTECK);
  expect(r.waende.map(w => +wandLaenge(w).toFixed(6))).toEqual([4.2, 3.6, 4.2, 3.6]);
  const m = raumMasse(r);
  expect(m.flaeche).toBeCloseTo(15.12, 6); expect(m.hoehe).toBe(2.5);
  expect(r.waende[0].a).toEqual({ x: -2.1, z: -1.8 }); // Wand 1 oben, von links nach rechts
  expect(r.offen).toBeCloseTo(0, 9);
});

test('Gegenprobe: Mittelwert und Unterschied', () => {
  const m = { ...RECHTECK, gegen: { laenge: 4.18, breite: 3.6 } };
  expect(wandKette(m)[0].laenge).toBeCloseTo(4.19, 9);
  expect(gegenprobe(m)).toEqual([{ wand: 'laenge', d: expect.closeTo(0.02, 9) }]);
  expect(gegenprobe({ ...RECHTECK, gegen: { laenge: 4.203 } })).toEqual([]);
});

test('Freie Form (L): Fläche stimmt, Raum geht auf', () => {
  const r = raumAusMassen(L_FORM);
  expect(flaeche(r.boden)).toBeCloseTo(5 * 4 - 2 * 1.5, 6);
  expect(r.offen).toBeCloseTo(0, 9);
  expect(raumMasse(r)).toMatchObject({ breite: expect.closeTo(5, 6), tiefe: expect.closeTo(4, 6) });
});

test('Geht der Raum nicht auf, wird verteilt und gemeldet', () => {
  const m = { ...L_FORM, waende: L_FORM.waende.map((w, i) => i === 4 ? { ...w, laenge: 5.03 } : w) };
  const { punkte, offen } = ecken(wandKette(m));
  expect(offen).toBeCloseTo(0.03, 6);
  const r = raumAusMassen(m);
  expect(flaeche(r.boden)).toBeCloseTo(17, 0); // 3 cm Fehler verteilt: Fläche weicht nur minimal ab
  expect(r.waende).toHaveLength(6);
  expect(punkte[0]).toEqual({ x: 0, z: 0 });
});

test('Tür, Fenster, Durchgang: Lage an der Wand von der linken Ecke', () => {
  const r = raumAusMassen({ ...RECHTECK, elemente: [
    { id: 't', art: 'tuer', wand: 3, abstand: 0.2, breite: 0.885 },
    { id: 'f', art: 'fenster', wand: 0, abstand: 1.4, breite: 1.4 },
    { id: 'd', art: 'durchgang', wand: 1, abstand: 1, breite: 0.9 }
  ] });
  const [t, f, d] = r.oeffnungen;
  // Wand 4 ist die linke Wand, läuft von unten nach oben; von innen gesehen ist links unten
  expect(t).toMatchObject({ art: 'tuer', wandId: 'w4', x: expect.closeTo(-2.1, 9), z: expect.closeTo(1.8 - 0.2 - 0.4425, 9), unten: 0, aufschlag: 'innen', anschlag: 'links' });
  expect(f).toMatchObject({ art: 'fenster', x: expect.closeTo(-2.1 + 1.4 + 0.7, 9), z: -1.8, unten: 0.9 });
  expect(d).toMatchObject({ art: 'oeffnung', x: 2.1, z: expect.closeTo(-1.8 + 1.45, 9) });
});

test('Tür nach innen, Anschlag links: Viertelkreis an der richtigen Seite', () => {
  const r = raumAusMassen({ ...RECHTECK, elemente: [{ id: 't', art: 'tuer', wand: 0, abstand: 1, breite: 0.8, anschlag: 'links' }] });
  const s = schwenkbereich(r.oeffnungen[0], r);
  expect(s[0]).toEqual({ x: expect.closeTo(-2.1 + 1, 9), z: -1.8 }); // Angel an der linken Kante
  expect(flaeche(s)).toBeCloseTo(Math.PI * 0.64 / 4, 2);
  const stuhl = (x, z) => ({ id: 's', b: 0.14, t: 0.14, h: 0.9, ueberBoden: 0, winkel: 0, x, z });
  // Ecke des Quadrats, die der Bogen nicht erreicht → frei; dicht an der Angel → im Weg
  expect(ueberschneidungen({ ...r, moebel: [stuhl(-1.1 + 0.73, -1.8 + 0.73)] }).s).toBeUndefined();
  expect(ueberschneidungen({ ...r, moebel: [stuhl(-1.1 + 0.3, -1.8 + 0.3)] }).s).toEqual([{ art: 'tuer', id: 't' }]);
});

test('Tür nach außen hat keinen Schwenkbereich im Raum', () => {
  const r = raumAusMassen({ ...RECHTECK, elemente: [{ id: 't', art: 'tuer', wand: 0, abstand: 1, breite: 0.8, aufschlag: 'aussen' }] });
  expect(schwenkbereich(r.oeffnungen[0], r)).toBeNull();
});

test('Heizkörper wird festes Teil an der Wand; Sofa davor zeigt Überschneidung', () => {
  const r = raumAusMassen({ ...RECHTECK, elemente: [{ id: 'h', art: 'heizung', wand: 2, abstand: 1.5, breite: 1.2 }] });
  const hz = r.feste[0];
  expect(hz).toMatchObject({ fest: true, name: 'Heizkörper', winkel: 180, b: 1.2, t: 0.1, ueberBoden: 0.15 });
  expect(Math.max(...grundflaeche(hz).map(p => p.z))).toBeCloseTo(1.8, 9); // Rückseite an Wand 3 (unten)
  const raum = { ...r, moebel: [...r.feste] };
  const sofa = { id: 'sofa', b: 2, t: 0.9, h: 0.8, ueberBoden: 0, winkel: 0, x: 0, z: 0 };
  const { moebel } = zieheAuf(sofa, { x: -0.2, z: 1.8 - 0.5 }, raum);
  expect(moebel.winkel).toBe(180);
  expect(ueberschneidungen({ ...raum, moebel: [...raum.moebel, moebel] }).sofa).toEqual([{ art: 'moebel', id: 'h' }]);
});

test('Prüfung meldet fehlende und unpassende Maße', () => {
  expect(pruefeMessung({ ...RECHTECK, laenge: 0 })).toEqual(['Wand 1: Länge fehlt', 'Wand 3: Länge fehlt']);
  expect(pruefeMessung({ ...RECHTECK, hoehe: 0 })).toContain('Raumhöhe fehlt');
  expect(pruefeMessung({ ...RECHTECK, elemente: [{ art: 'fenster', wand: 1, abstand: 3, breite: 1 }] })).toEqual(['Fenster passt nicht auf Wand 2']);
  expect(() => raumAusMassen({ ...RECHTECK, breite: null })).toThrow(/Wand 2/);
  expect(vorschau({ ...RECHTECK, breite: null })).toBeNull();
  expect(vorschau(RECHTECK).flaeche).toBeCloseTo(15.12, 6);
});
