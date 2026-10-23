// Katalog im Entwurf: schlichte Körper mit üblichen Maßen (Meter: b × t × h). Echte Modelle (Poly Haven,
// Kenney, eigene GLB/USDZ, IKEA) kommen später dazu und tragen dann quelle, lizenz, stand je Modell.

export const KATEGORIEN = [
  ['sofa', 'Sofas & Sessel'], ['bett', 'Betten'], ['tisch', 'Tische'], ['stuhl', 'Stühle'],
  ['schrank', 'Schränke'], ['regal', 'Regale'], ['sonst', 'Sonstiges']
];

const k = (kategorie, name, b, t, h) => ({ id: `kasten:${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}`, kategorie, name, b, t, h,
  quelle: 'katalog', lizenz: 'eigene Maße, kein fremdes Modell', stand: '2026-10' });

export const KATALOG = [
  k('sofa', 'Sofa 2-Sitzer', 1.6, 0.88, 0.82),
  k('sofa', 'Sofa 3-Sitzer', 2.1, 0.92, 0.82),
  k('sofa', 'Sofa breit', 2.4, 0.98, 0.8),
  k('sofa', 'Sessel', 0.8, 0.85, 0.8),
  k('bett', 'Bett 90 × 200', 0.96, 2.08, 0.45),
  k('bett', 'Bett 140 × 200', 1.46, 2.08, 0.45),
  k('bett', 'Bett 160 × 200', 1.66, 2.08, 0.45),
  k('bett', 'Bett 180 × 200', 1.86, 2.08, 0.45),
  k('tisch', 'Esstisch', 1.6, 0.9, 0.75),
  k('tisch', 'Couchtisch', 1.1, 0.6, 0.45),
  k('tisch', 'Schreibtisch', 1.4, 0.7, 0.75),
  k('tisch', 'Nachttisch', 0.45, 0.4, 0.55),
  k('stuhl', 'Stuhl', 0.45, 0.52, 0.85),
  k('stuhl', 'Bürostuhl', 0.65, 0.65, 1.1),
  k('schrank', 'Kleiderschrank 2-türig', 1.0, 0.58, 2.01),
  k('schrank', 'Kleiderschrank 3-türig', 1.5, 0.58, 2.36),
  k('schrank', 'Kommode', 0.8, 0.48, 0.78),
  k('schrank', 'Sideboard', 1.6, 0.45, 0.75),
  k('schrank', 'TV-Bank', 1.5, 0.4, 0.5),
  k('regal', 'Bücherregal', 0.8, 0.28, 2.02),
  k('regal', 'Regal schmal', 0.4, 0.28, 2.02),
  k('regal', 'Würfelregal 4 × 4', 1.47, 0.39, 1.47),
  k('sonst', 'Pflanze', 0.4, 0.4, 1.2),
  k('sonst', 'Stehlampe', 0.3, 0.3, 1.6),
  k('sonst', 'Waschmaschine', 0.6, 0.6, 0.85)
];

export const EIGENES = { kategorie: 'sonst', name: 'Eigenes Möbel', b: 1.0, t: 0.5, h: 0.8, quelle: 'eigen' };

export function suche(text, kategorie) {
  const q = text.trim().toLowerCase();
  return KATALOG.filter(m => (!kategorie || m.kategorie === kategorie) && (!q || m.name.toLowerCase().includes(q)));
}
