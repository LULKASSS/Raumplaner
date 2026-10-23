// Zahlen für die Anzeige, deutsch formatiert. Intern ist alles in Metern.

const zahl = (v, stellen) => v.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export const zentimeter = m => Math.round(m * 100);
export const cm = m => `${zentimeter(m)} cm`;
export const meter = m => `${zahl(m, 2)} m`;
export const quadratmeter = m2 => `${zahl(m2, 1)} m²`;
/** „210 × 92 × 82 cm“ (Breite × Tiefe × Höhe). */
export const masse = m => `${zentimeter(m.b)} × ${zentimeter(m.t)} × ${zentimeter(m.h)} cm`;
/** „4,20 × 3,60 m · 15,1 m²“ */
export const raumText = r => `${zahl(r.breite, 2)} × ${zahl(r.tiefe, 2)} m · ${quadratmeter(r.flaeche)}`;
/** Eingetippte Zentimeter („92“, „92,5“) → Meter; ungültig → null. */
export function ausZentimetern(text) {
  const v = Number(String(text).trim().replace(',', '.'));
  return isFinite(v) && v > 0 && v < 2000 ? v / 100 : null;
}
