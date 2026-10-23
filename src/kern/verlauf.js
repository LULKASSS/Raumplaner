// Rückgängig / Wiederholen über ganze Zustände. Ein Ziehvorgang ist ein Schritt, nicht jede Fingerbewegung:
// die Oberfläche ruft `schritt` erst beim Loslassen.

export const MAX = 100;

export const neuerVerlauf = jetzt => ({ vorher: [], jetzt, nachher: [] });

export function schritt(v, neu) {
  if (JSON.stringify(neu) === JSON.stringify(v.jetzt)) return v;
  return { vorher: [...v.vorher, v.jetzt].slice(-MAX), jetzt: neu, nachher: [] };
}

export const kannZurueck = v => v.vorher.length > 0;
export const kannVor = v => v.nachher.length > 0;

export function rueckgaengig(v) {
  if (!kannZurueck(v)) return v;
  return { vorher: v.vorher.slice(0, -1), jetzt: v.vorher[v.vorher.length - 1], nachher: [v.jetzt, ...v.nachher] };
}

export function wiederholen(v) {
  if (!kannVor(v)) return v;
  return { vorher: [...v.vorher, v.jetzt], jetzt: v.nachher[0], nachher: v.nachher.slice(1) };
}
