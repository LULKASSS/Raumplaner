// Eingebauter Testraum zum Ausprobieren. Erfunden, keine echte Wohnung.

export const TESTRAUM = {
  name: 'Testraum',
  messung: {
    form: 'rechteck', laenge: 4.2, breite: 3.6, hoehe: 2.5,
    elemente: [
      { id: 'test-fenster', art: 'fenster', wand: 0, abstand: 1.4, breite: 1.4, hoehe: 1.3, bruestung: 0.9 },
      { id: 'test-heizung', art: 'heizung', wand: 0, abstand: 1.5, breite: 1.2, hoehe: 0.6, bruestung: 0.15, tiefe: 0.1 },
      { id: 'test-tuer', art: 'tuer', wand: 3, abstand: 0.2, breite: 0.885, hoehe: 2.01, aufschlag: 'innen', anschlag: 'links' }
    ]
  },
  moebel: [
    { id: 'test-sofa', kategorie: 'sofa', name: 'Sofa 3-Sitzer', quelle: 'katalog', modell: 'katalog:kenney-loungeSofa', x: 0.3, z: 1.34, winkel: 180, b: 2.1, t: 0.92, h: 0.82, ueberBoden: 0 },
    { id: 'test-tisch', kategorie: 'tisch', name: 'Couchtisch', quelle: 'katalog', modell: 'katalog:modern_coffee_table_01', x: 0.3, z: 0.2, winkel: 0, b: 1.2, t: 0.6, h: 0.39, ueberBoden: 0 },
    { id: 'test-regal', kategorie: 'regal', name: 'Bücherregal', quelle: 'katalog', modell: 'katalog:kenney-bookcaseOpen', x: 1.95, z: -0.2, winkel: 270, b: 0.8, t: 0.3, h: 1.8, ueberBoden: 0 }
  ]
};
