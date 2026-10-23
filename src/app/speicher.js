// Räume liegen nur im Browser (IndexedDB). Klappt das nicht (privates Fenster), bleibt alles im Speicher der Seite.

const DB = 'raumplaner', STORE = 'raeume';
let db = null, ersatz = null;

function oeffne() {
  if (db || ersatz) return Promise.resolve();
  return new Promise(ok => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => { db = r.result; ok(); };
      r.onerror = () => { ersatz = new Map(); ok(); };
    } catch { ersatz = new Map(); ok(); }
  });
}

function anfrage(modus, f) {
  return new Promise((ok, fehler) => {
    const tx = db.transaction(STORE, modus), r = f(tx.objectStore(STORE));
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = () => fehler(tx.error);
  });
}

export const nurImSpeicher = () => !!ersatz;

export async function alleRaeume() {
  await oeffne();
  const liste = ersatz ? [...ersatz.values()] : await anfrage('readonly', s => s.getAll());
  return liste.sort((a, b) => (b.geaendert || '').localeCompare(a.geaendert || ''));
}

export async function ladeRaum(id) {
  await oeffne();
  return ersatz ? ersatz.get(id) : anfrage('readonly', s => s.get(id));
}

export async function speichereRaum(doc) {
  await oeffne();
  const kopie = structuredClone({ ...doc, geaendert: new Date().toISOString() });
  if (ersatz) ersatz.set(kopie.id, kopie); else await anfrage('readwrite', s => s.put(kopie));
  return kopie;
}

export async function loescheRaum(id) {
  await oeffne();
  if (ersatz) ersatz.delete(id); else await anfrage('readwrite', s => s.delete(id));
}
