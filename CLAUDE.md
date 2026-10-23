# Raumplaner

Web-App: eigenen Raum ausmessen und Möbel in echter Größe platzieren, ähnlich wie der IKEA-Planer. Für einen Kumpel von Lukas, privat, am iPhone Pro. Sprache in App, Code-Kommentaren
und Commits: **Deutsch**. Auftrag von Lukas vom 23.10.2026.

## Ziel
- Wofür: vor dem Kauf oder Umstellen sehen, ob Möbel in echter Größe in den eigenen Raum passen
- Wer, wann: Lukas' Kumpel, privat, am iPhone (Safari, auch vom Home-Bildschirm), planen auch am Mac
- Gelungen, wenn: Raum ausmessen und eintippen, ein Sofa reinziehen und an die Wand stellen dauert unter
  fünf Minuten (Zeit ist Annahme, von Lukas zu bestätigen), und die Maße stimmen mit dem Zollstock auf wenige Zentimeter
- Abgenommen: Flieder als Akzentfarbe statt iOS-Blau (Lukas, 23.10.2026)
- Entschieden: Raum wird in der App ausgemessen (Wandlängen, Türen, Fenster), nicht gescannt (Lukas, 23.10.2026)
- Nicht gewollt: eigene native App (kein Apple-Entwicklerkonto), fremde Scan-App, Speicherung auf einem Server

## Stand (23.10.2026)
- Erster Aufschlag von Lukas abgenommen und auf `main` (23.10.2026). Läuft auf GitHub Pages:
  https://lulkasss.github.io/Raumplaner/ (Pages baut direkt aus `main`, Wurzelordner).
- Kann: Raum ausmessen (Rechteck mit Gegenprobe oder Wand für Wand, Türen mit Aufschlag/Angeln, Fenster,
  Durchgänge, Heizkörper), Grundriss und 3D, Möbel aus dem Katalog reinziehen, Einrasten an Wand/Ecke/Möbel,
  Abstände in cm beim Ziehen, Überschneidung rot + schraffiert, Möbel-Sheet (Maße, 15°-Drehen, frei drehen,
  Seite an die Wand, Duplizieren, Ersetzen mit „12 cm breiter“, Löschen), Rückgängig/Wiederholen, automatisch
  speichern (IndexedDB), Raum als Datei sichern/öffnen, Testraum, Home-Bildschirm (Manifest, Symbol).
- Seit 23.10.2026 auf `main` (von Lukas abgenommen): Katalog mit 29 echten Modellen (16 Poly Haven,
  13 Kenney) mit Vorschaubildern, 3D-Ansicht zeigt die Modelle, eigene GLB/USDZ laden (Vorderseite festlegen,
  per Breite auf echte Größe), eigene Modelle wandern mit in die Raum-Datei.
- Seit 23.10.2026 auf `main`: „Aus einer Anzeige“ – Anzeigentext (z. B. Kleinanzeigen) einfügen, Kern liest Name, Maße und
  Kategorie (`src/kern/anzeige.js`), fehlende oder geschätzte Maße werden markiert, optional ein Foto (auf 512 px
  verkleinert, liegt im Raum und vorn auf dem Kasten in 3D). Kein Abruf per Link: Kleinanzeigen hat kein 3D, und
  ein Link bräuchte einen Durchreicher; ob Kleinanzeigen automatisches Abrufen erlaubt, ist ungeprüft.
- Seit 23.10.2026 (Lukas' Test am iPhone): Neue Möbel suchen sich vom Bildschirmmittelpunkt aus den nächsten freien
  Platz ganz im Raum (`freierPlatz`/`istFrei` im Kern), nie außerhalb und nie auf einem anderen Möbel. Liegen Möbel
  übereinander, wird das ausgewählte gezogen und oben gezeichnet; erneutes Antippen schaltet der Reihe nach durch.
- Später: IKEA-Abruf (Lukas, 23.10.2026: „IKEA kommt später“; wo der Durchreicher läuft, entscheidet er).
- Kurswechsel 23.10.2026: Scannen fällt weg. Lukas fand die Scan-App nicht und will keine fremde App; ein Raum aus
  einem Video geht im Browser nicht zentimetergenau (kein LiDAR in Safari, kein Maßstab, Rechnen bräuchte einen Server).
  Der Import aus CapturedRoom-JSON bleibt im Kern, die Oberfläche bietet ihn nicht an.

## Aufbau
- `index.html` – Seite, CSS (Tokens hell/dunkel, iOS-Bausteine) und Importmap; kein Bundler. GitHub Pages liefert
  das Repo 1:1 aus, alle Pfade relativ.
- `src/app/` – Oberfläche als ES-Module: `main.js` (Zustand, Schirme Start/Ausmessen/Planen, Sheets),
  `grundriss.js` (SVG-Grundriss, Finger/Maus, Zoomen), `ansicht3d.js` (three.js, wird erst beim Umschalten geladen),
  `ui.js` (Segment, Schalter, Zahlfeld, Bottom Sheet, Hinweis), `speicher.js` (IndexedDB), `katalog.js`, `testraum.js`.
- `src/kern/` – Rechenkern, reine ES-Module ohne DOM und ohne three.js, einzeln getestet:
  - `geometrie.js` – Punkte, Drehung, Rechtecke, Trennachsen-Test, Abstände
  - `ausmessen.js` – Raum aus eingetippten Maßen (Rechteck, freie Form mit Fehlerausgleich, Türen usw.)
  - `raum.js` – Raum-Modell, Import aus CapturedRoom-JSON (derzeit ungenutzt), Raummaße
  - `platzieren.js` – Einrasten (Wand, Ecke, Möbel), Drehen, Abstände, Überschneidung, Ersetzen, Duplizieren
  - `verlauf.js` – Rückgängig/Wiederholen über ganze Zustände
  - `format.js` – deutsche Zahlen („4,20 m“, „15,1 m²“, „210 × 92 × 82 cm“)
- `vendor/three-0.186.1/` – three.js (MIT) mit OrbitControls, GLTFLoader, DRACOLoader (+ Wasm-Decoder),
  Meshopt-Decoder, USDLoader (+ fflate), feste Version, keine CDNs.
- `src/app/modelle.js` – Modelle laden (Katalog-GLB, eigene GLB/USDZ), auf den Boden stellen, Texturen auf 1024 px.
- `katalog/` – `katalog.json` (je Modell Name, Kategorie, Maße, Datei, Vorschau, Quelle, Autor, Lizenz, Stand),
  `modelle/*.glb`, `vorschau/*.png`. Erzeugt mit `npm run modelle` und `npm run vorschau`, nicht von Hand ändern.
- `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-512.png` – Home-Bildschirm.
- `daten/testraum.json` – erfundener Raum als CapturedRoom-JSON (für den Kern-Import), erzeugt von `scripts/testraum.mjs`.
- `scripts/serve.mjs` – Dev-Server auf :5190, auch im WLAN; `scripts/check.mjs` – Fehlercheck; `scripts/icon.mjs` – Symbole.
- `test/*.kern.spec.js`, `test/kern.spec.js` – Kern ohne Browser. `test/app.spec.js` – Oberfläche in WebKit als
  iPhone 15 Pro und als Mac-Fenster. `test/rundgang.schritte.mjs` – Rundgang für den Skill `ui-pruefung`.
- `proben/` – nur lokal, steht in `.gitignore`.

## Befehle
- `npm test` – Fehlercheck + alle Tests (≈10 s, braucht einmal `npx playwright install webkit`). Vor jedem Commit grün.
- `npm run dev` – lokal ansehen: http://localhost:5190, die WLAN-Adresse fürs iPhone steht in der Ausgabe.
- `npm run modelle` – Katalog-Modelle neu bauen (lädt Poly Haven 1k und das Kenney-Kit nach `.modelle-cache/`,
  richtet aus, verkleinert Texturen mit `sips`, Meshopt). Einzelne: `npm run modelle -- sofa_02`.
- `npm run vorschau` – Vorschaubilder neu rendern (`-- --blatt datei.png` gibt zusätzlich ein Übersichtsblatt).
- `npm run icon` – Symbole aus `icon.svg` neu erzeugen. `npm run testraum` – CapturedRoom-Testraum neu erzeugen.

## Regeln
- Repo ist **öffentlich** (GitHub Pages): nie echte Scans, IKEA-Modelle oder Daten des Kumpels committen.
  Testdaten sind erfunden. Der Fehlercheck schlägt bei Dateien in `proben/` und bei Modellen außerhalb von
  `test/daten/` und `katalog/` an.
- Kein Backend, keine Konten: alles bleibt im Browser (IndexedDB). Einzige Ausnahme: der IKEA-Durchreicher.
- Bibliotheken mit fester Version unter `vendor/`, keine CDNs zur Laufzeit.
- Rechenkern getrennt vom Zeichnen, einzeln getestet.
- Kein Titelbalken oben links (kein Logo, kein App-Name, kein Menüzeichen). Raumname als Titel ist okay.
- Katalogmodelle tragen `quelle`, `lizenz`, `stand`. Ins Repo nur CC0 oder ausdrücklich Erlaubtes.
- Look: iOS-Standard (Systemschrift, Bottom Sheets, Segmented Control, Listen, Schalter), Akzent Flieder aus
  den `app-ui`-Tokens `--accent`/`--accent-ink`. Von `app-ui` gelten Grundhaltung, Bewegung, Zahlen, Handy,
  Technik – **nicht** Farben, Schrift und Karten-Optik.

## Katalog: Quellen und Lizenzen
- **Poly Haven** (https://polyhaven.com, CC0): 16 Möbel in echter Größe (Maße aus dem Modell, stimmen mit der
  Angabe auf Poly Haven überein), 1k-Texturen. Genutzt werden heruntergeladene Dateien, nicht die Live-API – der
  Pflicht-Hinweis „Powered by Poly Haven“ gilt erst bei Live-Abruf; genannt wird die Quelle trotzdem im Katalog.
- **Kenney Furniture Kit 2.0** (https://kenney.nl/assets/furniture-kit, CC0): 13 Modelle, Spiel-Look und Spiel-
  Maßstab, darum auf übliche Maße gestreckt (Liste in `scripts/modelle.mjs`). Das Kit liefert schon GLB.
- Je Modell stehen Quelle, Autor, Lizenz und Stand in `katalog/katalog.json`; der Fehlercheck lässt nur CC0 durch.
- Vorderseite: Poly Haven zeigt nach +Z (Blender −Y); Ausnahme `modern_coffee_table_01` (um 90° gedreht).
  Geprüft am Übersichtsblatt der Vorschaubilder.
- Nicht genommen: Ecksofas (L-Form passt nicht zur rechteckigen Grundfläche im Kern), Gothic-/Barockmöbel.

## Rechenkern: Abmachungen
- Meter, Grundriss in x/z, Y nach oben (wie RoomPlan). Beim Import wird der Raum gerade gedreht (Wände entlang
  x/z), der Boden auf y = 0 und die Raummitte auf 0/0 gelegt.
- Möbel: `b` Breite (lokal x), `t` Tiefe (lokal z), `h` Höhe; Vorderseite zeigt nach lokal +z;
  `winkel` in Grad wie three.js `rotation.y`. `ueberBoden` nur bei gescannten Teilen über 5 cm (z. B. Fernseher).
- Einrasten: Fangbereich 12 cm. Rückseite an die Wand (Vorderseite in den Raum), `ausrichtung: 'seite'`
  stellt die Seite an die Wand (Bett), `frei: true` (frei gedreht) rastet nur ein, wenn es schon parallel steht.
  Danach Ecke, danach bündig ans Nachbarmöbel, aber nie weg von einer Wand, an der es schon hängt.
- Überschneidung: bündig (bis 5 mm) zählt nicht. Möbel in verschiedener Höhe (Fernseher über Sideboard)
  überschneiden sich nicht.
- Ersetzen und Maße ändern: Rückseite bleibt, wo sie war. Ein ersetzter Scan-Körper behält seine Scan-Maße unter `scan`.

## Offene Annahmen (von Lukas zu prüfen)
- Zeitziel „unter fünf Minuten“ in der Zielkarte (vorher zwei Minuten mit Scan).
- Katalog im Entwurf: schlichte Kästen mit üblichen Maßen (keine fremden Modelle, darum lizenzfrei).
- Ausmessen: Wand 1 ist oben, gemessen wird im Uhrzeigersinn; „Abstand zur linken Ecke“ und „Angeln links/rechts“
  gelten von innen auf die Wand geschaut. Heizkörper: 100 × 10 × 60 cm, 15 cm über dem Boden vorbelegt.
- Geht eine freie Form nicht auf, wird der Fehler anteilig auf alle Ecken verteilt und angezeigt („3 cm offen“).
- Ein Möbel, das über die Wand hinaus gezogen wird, bleibt im Raum und rastet an dieser Wand ein. Bündig an ein
  Nachbarmöbel rastet es nur bis 12 cm Abstand oder Überlappung; tiefer hineingezogen bleibt es sichtbar überschnitten.
- Anzeige lesen: Maßketten ohne Beschriftung gelten als B × T × H (als geschätzt markiert), „L × B × H“ heißt Breite ×
  Tiefe × Höhe, Sitz- und Liegemaße zählen nicht; Bett aus Liegefläche: Rahmen +6 cm breit, +8 cm lang, 45 cm hoch
  (geschätzt). Fehlt die Höhe, gilt eine übliche je Kategorie (Sofa 85, Tisch 75, Schrank 100 cm …), ebenfalls markiert.
- Raum-Datei: `<Name>.raumplan.json`; am iPhone über das Teilen-Blatt („In Dateien sichern“, AirDrop), am Mac Download.
  Ab Version 2 stecken eigene Modelle, die im Raum stehen, als Base64 mit drin.
- Eigene Modelle: höchstens 80 MB, GLB (auch Draco/Meshopt) oder USDZ. Maßstab bleibt beim Drehen der Vorderseite
  gleich; wirken die Maße unecht (über 8 m oder unter 5 cm), bittet die App um die gemessene Breite.
- Modelle werden in 3D auf die Maße des Möbels gestreckt (b × t × h); ändert man die Maße im Sheet, ändert sich das
  Modell mit. Im Grundriss bleibt es ein Rechteck mit Namen.
- (nur für den ungenutzten Scan-Import) **CapturedRoom-JSON-Form** ist aus Apples Doku und dem Codable-Verhalten abgeleitet, nicht an einer echten
  Datei geprüft: Matrix als 16 Zahlen spaltenweise (vier Spalten geht auch), Kategorie als `{ "sofa": {} }`
  (Text geht auch), `dimensions` = Breite, Höhe, Tiefe, Mitte des Körpers im Transform, Wände ohne Dicke.
  Gebogene Wände (`curve`) und schräge Wandformen (`polygonCorners` an Wänden) werden noch ignoriert.
- **Tür-Schwenkbereich**: Ein Scan sagt nicht, wohin und auf welcher Seite die Tür aufgeht. Angenommen: nach
  innen, deshalb gilt das ganze Quadrat Türbreite × Türbreite vor der Tür als Schwenkbereich. Beim Ausmessen
  kann man Aufschlag und Anschlag angeben; dann gilt nur die echte Viertelkreis-Fläche.

## Erkenntnisse aus der Probe
Entfällt, seit der Raum ausgemessen statt gescannt wird (23.10.2026).
