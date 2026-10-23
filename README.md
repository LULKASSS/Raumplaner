# Raumplaner

Passt das Sofa? Raum mit dem Zollstock ausmessen, Maße eintippen, Möbel in echter Größe reinziehen und an die Wand
stellen – im Grundriss oder in 3D. Läuft im Browser, am iPhone wie eine App vom Home-Bildschirm.

**Öffnen:** https://lulkasss.github.io/Raumplaner/

## So geht's

1. **Raum ausmessen:** Länge und Breite eintippen (oder Wand für Wand bei anderen Formen), dazu Türen, Fenster,
   Durchgänge und Heizkörper.
2. **Möbel holen:** „+ Möbel“, aus dem Katalog wählen oder ein eigenes Möbel mit Maßen anlegen.
3. **Platzieren:** mit einem Finger ziehen – an der Wand rastet es ein, die Abstände stehen in Zentimetern daneben.
   Antippen öffnet Maße, Drehen, Duplizieren, Ersetzen und Löschen. Rot schraffiert heißt: überschneidet sich.

Am iPhone in Safari: Teilen → „Zum Home-Bildschirm“.

## Deine Daten

Alles bleibt im Browser des Geräts (IndexedDB), es gibt keinen Server und kein Konto. Zum Mitnehmen auf ein anderes
Gerät unter „…“ → „Als Datei sichern“ und dort über „Raum-Datei öffnen“ laden.

## Entwicklung

- `npm install`, einmal `npx playwright install webkit`
- `npm run dev` – lokal unter http://localhost:5190, die Adresse fürs iPhone im WLAN steht in der Ausgabe
- `npm test` – Fehlercheck, Rechenkern und Oberfläche in WebKit (iPhone und Mac); vor jedem Commit grün

Aufbau, Regeln und offene Annahmen stehen in der [`CLAUDE.md`](CLAUDE.md).

## Lizenzen

- [three.js](https://threejs.org) 0.186.1 unter `vendor/` – MIT-Lizenz (`vendor/three-0.186.1/LICENSE`)
- Möbel im Katalog: schlichte Körper mit üblichen Maßen, keine fremden Modelle
