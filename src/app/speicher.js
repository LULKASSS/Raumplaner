// Räume und eigene Modelle liegen nur im Browser (IndexedDB). Klappt das nicht (privates Fenster),
// bleibt alles im Speicher der Seite.

const DB = 'raumplaner', VERSION = 2, RAEUME = 'raeume', MODELLE = 'modelle';
let db = null, ersatz = null;

function oeffne() {
  if (db || ersatz) return Promise.resolve();
  return new Promise(ok => {
    try {
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => {
        for (const name of [RAEUME, MODELLE]) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' });
      };
      r.onsuccess = () => { db = r.result; ok(); };
      r.onerror = () => { ersatz = { [RAEUME]: new Map(), [MODELLE]: new Map() }; ok(); };
    } catch { ersatz = { [RAEUME]: new Map(), [MODELLE]: new Map() }; ok(); }
  });
}

function anfrage(store, modus, f) {
  return new Promise((ok, fehler) => {
    const tx = db.transaction(store, modus), r = f(tx.objectStore(store));
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = () => fehler(tx.error);
  });
}
const alle = async store => { await oeffne(); return ersatz ? [...ersatz[store].values()] : anfrage(store, 'readonly', s => s.getAll()); };
const eins = async (store, id) => { await oeffne(); return ersatz ? ersatz[store].get(id) : anfrage(store, 'readonly', s => s.get(id)); };
const lege = async (store, wert) => { await oeffne(); if (ersatz) ersatz[store].set(wert.id, wert); else await anfrage(store, 'readwrite', s => s.put(wert)); return wert; };
const weg = async (store, id) => { await oeffne(); if (ersatz) ersatz[store].delete(id); else await anfrage(store, 'readwrite', s => s.delete(id)); };

export const nurImSpeicher = () => !!ersatz;

/* ---------- Räume ---------- */
export async function alleRaeume() {
  return (await alle(RAEUME)).sort((a, b) => (b.geaendert || '').localeCompare(a.geaendert || ''));
}
export const ladeRaum = id => eins(RAEUME, id);
export const speichereRaum = doc => lege(RAEUME, structuredClone({ ...doc, geaendert: new Date().toISOString() }));
export const loescheRaum = id => weg(RAEUME, id);

/* ---------- Eigene Modelle: { id, name, art: 'glb' | 'usdz', daten: ArrayBuffer, drehung, b, t, h, vorschau? } ---------- */
/** Liste ohne die eigentlichen Dateien (die können groß sein). */
export async function alleModelle() {
  return (await alle(MODELLE)).map(({ daten, ...rest }) => rest).sort((a, b) => (b.angelegt || '').localeCompare(a.angelegt || ''));
}
export const ladeModellDaten = id => eins(MODELLE, id);
export const speichereModell = m => lege(MODELLE, { angelegt: new Date().toISOString(), ...m });
export const loescheModell = id => weg(MODELLE, id);
