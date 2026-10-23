// Rechenkern: Anzeigentexte lesen. Alle Anzeigen sind erfunden.
import { test, expect } from '@playwright/test';
import { leseAnzeige } from '../src/kern/anzeige.js';

test.describe.configure({ mode: 'parallel' });
const nah = v => expect.closeTo(v, 6);

test('Maßkette mit B x T x H und Name aus der ersten Zeile', () => {
  const a = leseAnzeige(`Graues Sofa 3-Sitzer, wie neu | Kleinanzeigen
150 € VB
Verkaufe unser Sofa, Nichtraucherhaushalt.
Maße B x T x H: 210 x 92 x 85 cm, Sitzhöhe 45 cm`);
  expect(a).toMatchObject({ name: 'Graues Sofa 3-Sitzer, wie neu', kategorie: 'sofa', b: nah(2.1), t: nah(0.92), h: nah(0.85), fehlt: [], geraten: [] });
});

test('Einzelmaße mit Beschriftung, Sitzhöhe wird nicht zur Höhe', () => {
  const a = leseAnzeige('Sessel Cord braun\nSitzhöhe: 42 cm\nBreite: 78 cm\nTiefe 84cm\nHöhe ca. 95 cm');
  expect(a).toMatchObject({ kategorie: 'sofa', b: nah(0.78), t: nah(0.84), h: nah(0.95), geraten: [] });
});

test('L x B x H: Länge ist die Breite, Breite die Tiefe', () => {
  const a = leseAnzeige('Sideboard Eiche massiv\nMaße (L x B x H): 180 x 45 x 75 cm');
  expect(a).toMatchObject({ kategorie: 'schrank', b: nah(1.8), t: nah(0.45), h: nah(0.75) });
});

test('B x H x T in anderer Reihenfolge', () => {
  const a = leseAnzeige('Kommode weiß\nBxHxT 80x78x48');
  expect(a).toMatchObject({ b: nah(0.8), h: nah(0.78), t: nah(0.48), geraten: [] });
});

test('Ohne Beschriftung: Reihenfolge geraten, Meter mit Komma', () => {
  const a = leseAnzeige('Esstisch Holz\nca. 1,60 x 0,90 x 0,75 m, ausziehbar');
  expect(a).toMatchObject({ kategorie: 'tisch', b: nah(1.6), t: nah(0.9), h: nah(0.75) });
  expect(a.geraten.sort()).toEqual(['b', 'h', 't']);
});

test('Bett 140 x 200: Rahmen etwas größer, Höhe üblich – alles als geraten markiert', () => {
  const a = leseAnzeige('Doppelbett mit Lattenrost, Liegefläche 140 x 200 cm');
  expect(a).toMatchObject({ kategorie: 'bett', b: nah(1.46), t: nah(2.08), h: nah(0.45) });
  expect(a.geraten.sort()).toEqual(['b', 'h', 't']);
});

test('Runder Tisch mit Durchmesser', () => {
  const a = leseAnzeige('Runder Couchtisch Marmor, Ø 80 cm, Höhe 40 cm');
  expect(a).toMatchObject({ kategorie: 'tisch', b: nah(0.8), t: nah(0.8), h: nah(0.4) });
});

test('Millimeter und Zahlen ohne Einheit', () => {
  expect(leseAnzeige('Regal\nMaße in mm: 800 x 280 x 2020')).toMatchObject({ kategorie: 'regal', b: nah(0.8), t: nah(0.28), h: nah(2.02) });
  expect(leseAnzeige('Schreibtisch 140x70x75')).toMatchObject({ b: nah(1.4), t: nah(0.7), h: nah(0.75) });
});

test('Keine Maße: alles fehlt, Name trotzdem da; Unsinn wird verworfen', () => {
  const a = leseAnzeige('Schöner alter Schrank\nAbholung in Köln');
  expect(a).toMatchObject({ name: 'Schöner alter Schrank', kategorie: 'schrank', b: null, t: null, h: null, fehlt: ['b', 't', 'h'] });
  expect(leseAnzeige('Tisch 9999 x 2 x 1 cm').b).toBeNull();
  expect(leseAnzeige('').name).toBe('Möbel aus Anzeige');
});

test('Preiszeile und Link werden beim Namen übersprungen', () => {
  expect(leseAnzeige('49 €\nhttps://www.kleinanzeigen.de/s-anzeige/123\nIKEA Kallax Regal 4x4').name).toBe('IKEA Kallax Regal 4x4');
});
