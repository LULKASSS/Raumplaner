// 3D-Ansicht mit three.js: Raum aus den Maßen nachbauen, Möbel als schlichte Körper. Frei drehen und zoomen;
// ein Möbel mit einem Finger ziehen verschiebt es über den Boden (Einrasten macht der Kern, wie im Grundriss).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sub, dot, einheit, laenge, huelle, rad } from '../kern/geometrie.js';
import { innenNormale } from '../kern/raum.js';
import { modellFuer } from './modelle.js';

const DICKE = 0.1;
const farbe = name => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888');

export function erstelle3D(el, o) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.append(renderer.domElement);

  const szene = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  const steuerung = new OrbitControls(kamera, renderer.domElement);
  steuerung.enableDamping = true;
  steuerung.maxPolarAngle = rad(86);
  steuerung.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  szene.add(new THREE.HemisphereLight(0xffffff, 0x8e8c9a, 1.25));
  const sonne = new THREE.DirectionalLight(0xffffff, 1.15);
  sonne.position.set(3, 7, 4); sonne.castShadow = true;
  sonne.shadow.mapSize.set(1024, 1024);
  Object.assign(sonne.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 25 });
  sonne.shadow.bias = -0.0005;
  szene.add(sonne);

  const raumGruppe = new THREE.Group(), moebelGruppe = new THREE.Group();
  szene.add(raumGruppe, moebelGruppe);
  let daten = null, raumSchluessel = '', waende = [], aktiv = false, eingepasst = false;

  function leeren(g) {
    for (const k of [...g.children]) { g.remove(k); k.traverse(x => { x.geometry?.dispose(); x.material?.dispose?.(); }); }
  }

  function baueRaum(raum) {
    leeren(raumGruppe); waende = [];
    szene.background = farbe('--plan-grund');
    const bodenForm = new THREE.Shape(raum.boden.map(p => new THREE.Vector2(p.x, -p.z)));
    const boden = new THREE.Mesh(new THREE.ShapeGeometry(bodenForm), new THREE.MeshStandardMaterial({ color: 0xe6e3dd, roughness: 0.95 }));
    boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true;
    raumGruppe.add(boden);
    const wandMat = () => new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.9, transparent: true });
    for (const w of raum.waende) {
      const L = laenge(sub(w.b, w.a)), u = einheit(sub(w.b, w.a)), n = innenNormale(w, raum), H = w.hoehe;
      const loecher = raum.oeffnungen.filter(x => x.wandId === w.id).map(x => {
        const t = dot(sub(x, w.a), u);
        return { t0: Math.max(0, t - x.breite / 2), t1: Math.min(L, t + x.breite / 2), unten: x.unten, oben: Math.min(H, x.unten + x.hoehe), art: x.art };
      }).sort((a, b) => a.t0 - b.t0);
      const stuecke = [];
      let t = 0;
      for (const l of loecher) {
        if (l.t0 > t) stuecke.push([t, l.t0, 0, H]);
        if (l.unten > 0.01) stuecke.push([l.t0, l.t1, 0, l.unten]);
        if (l.oben < H - 0.01) stuecke.push([l.t0, l.t1, l.oben, H]);
        t = Math.max(t, l.t1);
      }
      if (t < L) stuecke.push([t, L, 0, H]);
      const gruppe = new THREE.Group(), mat = wandMat();
      // Wandstücke um die Ecken verlängern, damit keine Lücken bleiben
      for (const [t0, t1, y0, y1] of stuecke) {
        const a0 = t0 === 0 ? -DICKE : t0, a1 = t1 === L ? L + DICKE : t1, len = a1 - a0;
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, DICKE), mat);
        const mitte = (a0 + a1) / 2;
        box.position.set(w.a.x + u.x * mitte - n.x * DICKE / 2, (y0 + y1) / 2, w.a.z + u.z * mitte - n.z * DICKE / 2);
        box.rotation.y = Math.atan2(-u.z, u.x);
        box.castShadow = true; box.receiveShadow = true;
        gruppe.add(box);
      }
      for (const l of loecher.filter(x => x.art === 'fenster')) {
        const glas = new THREE.Mesh(new THREE.PlaneGeometry(l.t1 - l.t0, l.oben - l.unten), new THREE.MeshStandardMaterial({ color: 0xa9c7e8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        const mitte = (l.t0 + l.t1) / 2;
        glas.position.set(w.a.x + u.x * mitte - n.x * DICKE / 2, (l.unten + l.oben) / 2, w.a.z + u.z * mitte - n.z * DICKE / 2);
        glas.rotation.y = Math.atan2(-u.z, u.x);
        gruppe.add(glas);
      }
      raumGruppe.add(gruppe);
      waende.push({ gruppe, mat, n, p: { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 } });
    }
  }

  // Möbel bleiben stehen und werden nur verschoben; neu gebaut wird ein Teil nur, wenn Modell oder Maße sich ändern
  const teile = new Map();
  const idVon = x => { while (x && !x.userData?.id) x = x.parent; return x?.userData; };
  function entferne(t) { moebelGruppe.remove(t.g); t.g.traverse(x => { if (!x.userData?.geteilt) { x.geometry?.dispose(); x.material?.dispose?.(); } }); }

  function neuesTeil(m, schluessel, c) {
    const g = new THREE.Group();
    g.userData = { id: m.id, fest: !!m.fest };
    const geo = new THREE.BoxGeometry(m.b, m.h, m.t); geo.translate(0, m.h / 2, 0);
    const grundfarbe = () => new THREE.MeshStandardMaterial({ color: m.fest ? c.fest : c.normal, roughness: 0.8 });
    // Foto aus einer Anzeige auf die Vorderseite (+Z, Fläche 4 des Würfels)
    let material = grundfarbe();
    if (m.foto && !m.modell) {
      const vorn = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
      new THREE.TextureLoader().load(m.foto, tex => { tex.colorSpace = THREE.SRGBColorSpace; vorn.map = tex; vorn.needsUpdate = true; });
      material = [grundfarbe(), grundfarbe(), grundfarbe(), grundfarbe(), vorn, grundfarbe()];
    }
    const box = new THREE.Mesh(geo, material);
    box.castShadow = true; box.receiveShadow = true;
    const rahmen = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: c.rand, transparent: true, opacity: 0.9 }));
    const warn = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c.rot, transparent: true, opacity: 0.3, depthWrite: false }));
    warn.scale.setScalar(1.01); warn.visible = false;
    g.add(box, rahmen, warn);
    const t = { g, schluessel, box, rahmen, warn, modell: false };
    if (m.modell) {
      // solange das Modell lädt: durchsichtiger Kasten in echter Größe
      box.material.transparent = true; box.material.opacity = 0.35;
      modellFuer(m.modell).then(({ gruppe, masse }) => {
        if (teile.get(m.id) !== t) return;
        gruppe.scale.set(m.b / masse.b, m.h / masse.h, m.t / masse.t);
        gruppe.traverse(x => { x.userData.geteilt = true; });
        g.add(gruppe); box.visible = false; t.modell = true;
        el.dataset.modelle = String(+(el.dataset.modelle || 0) + 1); // für Tests: so viele Modelle sind da
        if (daten) zustand();
      }).catch(e => { box.material.transparent = false; box.material.opacity = 1; o.beiFehler?.(e.message); });
    }
    moebelGruppe.add(g);
    return t;
  }

  function baueMoebel() {
    const c = { normal: farbe('--plan-moebel'), fest: farbe('--plan-fest'), rand: farbe('--plan-moebel-rand'), rot: farbe('--rot') };
    const da = new Set();
    for (const m of daten.raum.moebel) {
      da.add(m.id);
      const schluessel = JSON.stringify([m.modell, m.b, m.t, m.h, m.fest, m.foto ? m.foto.length + m.foto.slice(-24) : '']);
      let t = teile.get(m.id);
      if (!t || t.schluessel !== schluessel) { if (t) entferne(t); t = neuesTeil(m, schluessel, c); teile.set(m.id, t); }
      t.g.position.set(m.x, m.ueberBoden || 0, m.z);
      t.g.rotation.y = rad(m.winkel);
    }
    for (const [id, t] of teile) if (!da.has(id)) { entferne(t); teile.delete(id); }
    zustand();
  }

  /** Auswahl (Flieder-Rahmen) und Überschneidung (rot) anzeigen. */
  function zustand() {
    const { raum, auswahl, kollisionen = {} } = daten;
    const c = { normal: farbe('--plan-moebel'), fest: farbe('--plan-fest'), wahl: farbe('--accent'), rot: farbe('--rot'), rand: farbe('--plan-moebel-rand') };
    for (const m of raum.moebel) {
      const t = teile.get(m.id); if (!t) continue;
      const rot = !!kollisionen[m.id] && !m.fest, wahl = m.id === auswahl;
      t.rahmen.material.color.copy(rot ? c.rot : wahl ? c.wahl : c.rand);
      t.rahmen.visible = rot || wahl || !t.modell;
      t.warn.visible = rot;
      if (!t.modell) for (const mat of [].concat(t.box.material)) if (!mat.map) mat.color.copy(wahl ? c.wahl : m.fest ? c.fest : c.normal);
    }
  }

  function einpassen() {
    if (!daten) return;
    const hb = huelle(daten.raum.boden), cx = (hb.minX + hb.maxX) / 2, cz = (hb.minZ + hb.maxZ) / 2;
    const hoehe = Math.max(...daten.raum.waende.map(w => w.hoehe));
    // ganzer Raum im Bild, auch im Hochformat: Kugel um den Raum, kleinerer Öffnungswinkel zählt
    const r = Math.hypot(hb.maxX - hb.minX, hb.maxZ - hb.minZ, hoehe) / 2;
    const v = rad(kamera.fov), hz = 2 * Math.atan(Math.tan(v / 2) * kamera.aspect), abstand = r / Math.sin(Math.min(v, hz) / 2) * 1.02;
    const richtung = new THREE.Vector3(0.3, 1.05, 0.95).normalize();
    steuerung.target.set(cx, hoehe * 0.2, cz);
    kamera.position.set(cx + richtung.x * abstand, hoehe * 0.2 + richtung.y * abstand, cz + richtung.z * abstand);
    steuerung.update();
    eingepasst = true;
  }

  function zeichne(neu) {
    daten = neu;
    const schluessel = JSON.stringify([neu.raum.boden, neu.raum.oeffnungen, neu.raum.waende.map(w => w.hoehe), document.documentElement.dataset.theme, matchMedia('(prefers-color-scheme: dark)').matches]);
    if (schluessel !== raumSchluessel) { baueRaum(neu.raum); raumSchluessel = schluessel; eingepasst = eingepasst && !neu.neuEinpassen; }
    baueMoebel();
    if (!eingepasst && el.clientWidth) { groesse(); einpassen(); }
  }

  function groesse() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h; kamera.updateProjectionMatrix();
  }
  new ResizeObserver(groesse).observe(el);

  // Wände zwischen Kamera und Raum ausblenden
  function bild() {
    steuerung.update();
    for (const w of waende) {
      const aussen = (kamera.position.x - w.p.x) * w.n.x + (kamera.position.z - w.p.z) * w.n.z < 0;
      w.mat.opacity = aussen ? 0.12 : 1; w.mat.depthWrite = !aussen;
    }
    renderer.render(szene, kamera);
  }

  /* ---------- Ziehen ---------- */
  const strahl = new THREE.Raycaster(), maus = new THREE.Vector2(), ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let geste = null, zeiger = 0;
  const treffer = e => {
    const b = renderer.domElement.getBoundingClientRect();
    maus.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    strahl.setFromCamera(maus, kamera);
  };
  const bodenPunkt = e => { treffer(e); const p = new THREE.Vector3(); return strahl.ray.intersectPlane(ebene, p) ? { x: p.x, z: p.z } : null; };
  el.addEventListener('pointerdown', e => {
    zeiger++;
    if (zeiger > 1) { if (geste?.bewegt) o.beiZiehen?.(geste.id, null, 'ende'); geste = null; steuerung.enabled = true; return; }
    treffer(e);
    // alle Möbel auf dem Strahl, nächstes zuerst; gezogen wird das ausgewählte, Antippen schaltet der Reihe nach durch
    const ids = [...new Set(strahl.intersectObjects(moebelGruppe.children, true).map(x => idVon(x.object)).filter(d => d && !d.fest).map(d => d.id))];
    const id = ids.includes(daten?.auswahl) ? daten.auswahl : ids[0];
    geste = { id, x: e.clientX, y: e.clientY, bewegt: false, ids };
    if (id) {
      steuerung.enabled = false;
      const p = bodenPunkt(e), m = daten.raum.moebel.find(x => x.id === id);
      geste.griff = p ? sub(p, m) : { x: 0, z: 0 };
    }
  }, true);
  el.addEventListener('pointermove', e => {
    if (!geste) return;
    if (!geste.bewegt && Math.hypot(e.clientX - geste.x, e.clientY - geste.y) > 6) geste.bewegt = true;
    if (geste.id && geste.bewegt) { const p = bodenPunkt(e); if (p) o.beiZiehen?.(geste.id, sub(p, geste.griff), 'bewegt'); }
  });
  const ende = e => {
    zeiger = Math.max(0, zeiger - 1);
    if (!geste) { steuerung.enabled = true; return; }
    if (geste.id && geste.bewegt) { const p = bodenPunkt(e); o.beiZiehen?.(geste.id, p ? sub(p, geste.griff) : null, 'ende'); }
    else if (!geste.bewegt && e.type === 'pointerup') {
      const i = geste.ids.indexOf(daten?.auswahl);
      o.beiTippen?.(geste.ids.length > 1 && i >= 0 ? geste.ids[(i + 1) % geste.ids.length] : geste.id || null);
    }
    geste = null; steuerung.enabled = true;
  };
  el.addEventListener('pointerup', ende);
  el.addEventListener('pointercancel', ende);

  return {
    zeichne,
    einpassen,
    aktiv(an) {
      if (an === aktiv) return;
      aktiv = an;
      if (an) { groesse(); if (!eingepasst && daten) einpassen(); renderer.setAnimationLoop(bild); } else renderer.setAnimationLoop(null);
    },
    farbenNeu() { raumSchluessel = ''; for (const t of teile.values()) entferne(t); teile.clear(); if (daten) zeichne(daten); }
  };
}
