// 3D-Modelle laden: Katalog (katalog/katalog.json) und eigene Modelle (GLB oder USDZ aus der IndexedDB).
// Jedes Modell wird auf den Boden gestellt und mittig gesetzt; die Vorderseite zeigt nach +Z.
// Texturen werden beim Laden auf höchstens 1024 px verkleinert (iPhone-tauglich).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { ladeModellDaten } from './speicher.js';
import { katalogEintrag } from './katalog.js';

const MAX_TEXTUR = 1024;
const draco = new DRACOLoader().setDecoderPath(new URL('../../vendor/three-0.186.1/addons/libs/draco/', import.meta.url).href);
const gltf = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
const usd = new USDLoader();
const cache = new Map();

/** Art der Datei an den ersten Bytes: GLB beginnt mit „glTF“, USDZ ist ein ZIP („PK“). */
export function dateiArt(puffer) {
  const b = new Uint8Array(puffer, 0, 4);
  if (b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46) return 'glb';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'usdz';
  return null;
}

/** Datei (ArrayBuffer) zu einem three-Objekt. Wirft verständliche Fehler. */
export async function parse(puffer, art = dateiArt(puffer)) {
  if (art === 'glb') {
    await MeshoptDecoder.ready;
    const g = await gltf.parseAsync(puffer, '');
    return g.scene;
  }
  if (art === 'usdz') {
    const o = usd.parse(puffer);
    if (!o || !hatNetze(o)) throw new Error('In der USDZ-Datei ist kein 3D-Körper, den der Browser lesen kann');
    return o;
  }
  throw new Error('Nur GLB- oder USDZ-Dateien');
}
const hatNetze = o => { let ja = false; o.traverse(x => { if (x.isMesh) ja = true; }); return ja; };

/** Große Texturen verkleinern, damit das iPhone nicht ins Stocken kommt. */
export function texturenBegrenzen(o) {
  const gesehen = new Set();
  o.traverse(x => {
    if (!x.isMesh) return;
    for (const mat of [].concat(x.material)) for (const wert of Object.values(mat)) {
      if (!wert?.isTexture || gesehen.has(wert)) continue;
      gesehen.add(wert);
      const bild = wert.image, w = bild?.width, h = bild?.height;
      if (!w || Math.max(w, h) <= MAX_TEXTUR) continue;
      const k = MAX_TEXTUR / Math.max(w, h), c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
      wert.image = c; wert.needsUpdate = true;
    }
  });
}

/**
 * Stellt das Objekt auf den Boden und in die Mitte, dreht es um `drehung` Grad (Vorderseite festlegen).
 * Gibt eine Gruppe und die Maße (Meter, b × t × h) zurück.
 */
export function normalisiere(objekt, drehung = 0) {
  const innen = new THREE.Group(), aussen = new THREE.Group();
  innen.add(objekt); innen.rotation.y = THREE.MathUtils.degToRad(drehung);
  aussen.add(innen);
  aussen.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(aussen), groesse = box.getSize(new THREE.Vector3());
  innen.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  aussen.traverse(x => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
  return { gruppe: aussen, masse: { b: groesse.x, t: groesse.z, h: groesse.y } };
}

/** Modell zu einem Verweis „katalog:<id>“ oder „eigen:<id>“; geladen wird jedes nur einmal, zurück kommt eine Kopie. */
export async function modellFuer(verweis) {
  if (!cache.has(verweis)) cache.set(verweis, ladeVerweis(verweis).catch(e => { cache.delete(verweis); throw e; }));
  const { gruppe, masse } = await cache.get(verweis);
  return { gruppe: gruppe.clone(true), masse };
}

async function ladeVerweis(verweis) {
  const [quelle, id] = verweis.split(/:(.*)/s);
  if (quelle === 'katalog') {
    const e = await katalogEintrag(id);
    if (!e) throw new Error(`Modell ${id} fehlt im Katalog`);
    const antwort = await fetch(new URL('../../' + e.datei, import.meta.url));
    if (!antwort.ok) throw new Error(`Modell ${e.name} lädt nicht (${antwort.status})`);
    const o = await parse(await antwort.arrayBuffer(), 'glb');
    return normalisiere(o);
  }
  if (quelle === 'eigen') {
    const d = await ladeModellDaten(id);
    if (!d) throw new Error('Eigenes Modell fehlt auf diesem Gerät');
    const o = await parse(d.daten, d.art);
    texturenBegrenzen(o);
    return normalisiere(o, d.drehung);
  }
  throw new Error('Unbekannter Modell-Verweis');
}

export function vergiss(verweis) { cache.delete(verweis); }
