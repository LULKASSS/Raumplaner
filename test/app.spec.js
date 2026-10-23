// Oberfläche im Browser (WebKit): ausmessen, Möbel reinziehen, an die Wand, Ersetzen, Rückgängig, Neuladen, Datei.
import { test, expect } from '@playwright/test';

let fehler;
test.beforeEach(async ({ page }) => {
  fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push(m.text()); });
});
test.afterEach(() => expect(fehler).toEqual([]));

/** Mitte eines Möbels im Grundriss (über seine Beschriftung). */
async function moebelMitte(page, name) {
  await page.waitForFunction(() => document.querySelectorAll('.schirm').length === 1); // Schirmwechsel fertig
  await expect(page.locator('.buehne svg text.g-name', { hasText: name })).toBeVisible();
  // boundingBox() liefert für SVG-Text in WebKit 0/0, getBoundingClientRect stimmt
  return page.evaluate(n => {
    const b = [...document.querySelectorAll('.buehne svg text.g-name')].find(t => t.textContent === n).getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, name);
}
async function ziehe(page, von, nach, schritte = 12) {
  await page.mouse.move(von.x, von.y); await page.mouse.down();
  for (let i = 1; i <= schritte; i++) await page.mouse.move(von.x + (nach.x - von.x) * i / schritte, von.y + (nach.y - von.y) * i / schritte);
  return () => page.mouse.up();
}

test('Raum ausmessen, Sofa an die Wand, Neuladen behält alles', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Raum ausmessen').click();
  await page.getByLabel('Name des Raums').fill('Wohnzimmer');
  await page.getByLabel('Wand 1 · oben').fill('420');
  await page.getByLabel('Wand 2 · rechts').fill('360');
  await page.getByRole('button', { name: 'Tür' }).click();
  await page.getByRole('button', { name: 'Möbel stellen' }).click();
  const titel = page.locator('section:has(.buehne) .kopf .titel');
  await expect(titel.locator('b')).toHaveText('Wohnzimmer');
  await expect(titel.locator('small')).toHaveText('4,20 × 3,60 m · 15,1 m²');

  await page.getByRole('button', { name: 'Möbel', exact: true }).click();
  await page.getByText('Sofa 3-Sitzer').click();
  const mitte = await moebelMitte(page, 'Sofa 3-Sitzer');
  // weit nach unten ziehen: bleibt im Raum und rastet an Wand 3 ein, Abstände stehen am Möbel
  const loslassen = await ziehe(page, mitte, { x: mitte.x + 5, y: mitte.y + 400 });
  await expect(page.locator('.g-pille-text').first()).toHaveText(/\d+ cm/);
  await loslassen();
  // gespeichert wird kurz verzögert – so lange nachsehen, bis das Sofa in der IndexedDB liegt
  let sofa;
  await expect.poll(async () => (sofa = await page.evaluate(async () => {
    const id = decodeURIComponent(location.hash.split('=')[1]);
    const db = await new Promise(ok => { const r = indexedDB.open('raumplaner'); r.onsuccess = () => ok(r.result); });
    const doc = await new Promise(ok => { const r = db.transaction('raeume').objectStore('raeume').get(id); r.onsuccess = () => ok(r.result); });
    return doc?.moebel[0];
  }))?.winkel).toBe(180);
  expect(sofa.winkel).toBe(180);                      // Vorderseite zeigt in den Raum
  expect(sofa.z + sofa.t / 2).toBeCloseTo(1.8, 6);    // Rückseite an Wand 3

  await page.reload();
  await expect(page.locator('section:has(.buehne) .kopf .titel b')).toHaveText('Wohnzimmer');
  await expect(page.locator('.buehne svg text.g-name', { hasText: 'Sofa 3-Sitzer' })).toBeVisible();
  await page.getByRole('button', { name: 'Räume' }).click();
  await expect(page.getByRole('button', { name: /Wohnzimmer.*4,20 × 3,60 m/ })).toBeVisible();
});

test('Testraum: Überschneidung, Ersetzen mit Unterschied, Rückgängig, 3D', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Testraum ansehen').click();
  const sofa = await moebelMitte(page, 'Sofa 3-Sitzer'), tisch = await moebelMitte(page, 'Couchtisch');
  const loslassen = await ziehe(page, sofa, tisch);
  await loslassen();
  await expect(page.locator('path.g-m.rot')).toHaveCount(2);           // Sofa und Tisch rot …
  await expect(page.locator('path.g-schraffur')).toHaveCount(2);       // … und schraffiert
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('path.g-m.rot')).toHaveCount(0);

  await page.mouse.click(sofa.x, sofa.y);
  await expect(page.locator('.blatt-kopf input')).toHaveValue('Sofa 3-Sitzer');
  await page.getByRole('button', { name: '15° nach rechts' }).click();
  await expect(page.locator('.drehmitte output')).toHaveText('195°');
  await page.getByRole('button', { name: '15° nach links' }).click();
  await page.getByRole('button', { name: 'Ersetzen' }).click();
  await page.getByText('Sofa breit').click();
  await expect(page.locator('#toast')).toHaveText('30 cm breiter · 6 cm tiefer · 2 cm niedriger');
  await expect(page.locator('.blatt-kopf input')).toHaveValue('Sofa breit');
  await page.getByRole('button', { name: 'Schließen' }).click();

  await page.getByRole('tab', { name: '3D' }).click();
  await expect(page.locator('.buehne canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'Grundriss' }).click();
  await expect(page.locator('.buehne svg text.g-name', { hasText: 'Sofa breit' })).toBeVisible();
});

test('Raum als Datei sichern und wieder öffnen', async ({ page }) => {
  // Das Teilen-Blatt von iOS gibt es im Test nicht – dann greift der normale Download
  await page.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { value: undefined }); });
  await page.goto('/');
  await page.getByText('Testraum ansehen').click();
  await page.getByRole('button', { name: 'Mehr' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Als Datei sichern').click()]);
  const pfad = await download.path();
  expect(download.suggestedFilename()).toBe('Testraum.raumplan.json');
  await page.getByRole('button', { name: 'Schließen' }).click();
  await page.getByRole('button', { name: 'Räume' }).click();
  await page.locator('input[type=file]').setInputFiles(pfad);
  await expect(page.locator('#toast')).toHaveText(/Testraum geöffnet/);
  await page.waitForFunction(() => document.querySelectorAll('.schirm').length === 1);
  await expect(page.locator('.buehne svg text.g-name', { hasText: 'Couchtisch' })).toBeVisible();
});

test('Ausmessen: Unsinn wird geleert, Formwechsel behält die Maße, L-Form geht auf', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Raum ausmessen').click();
  await page.getByLabel('Wand 1 · oben').fill('420');
  await page.getByLabel('Wand 2 · rechts').fill('abc');
  await page.getByLabel('Wand 2 · rechts').blur();
  await expect(page.getByLabel('Wand 2 · rechts')).toHaveValue('');
  await page.getByRole('button', { name: 'Möbel stellen' }).click();
  await expect(page.locator('.mess-fuss .fehler')).toHaveText('Wand 2: Länge fehlt');
  await page.getByLabel('Wand 2 · rechts').fill('360');
  await page.getByRole('tab', { name: 'Andere Form' }).click();
  await page.getByRole('tab', { name: 'Rechteck' }).click();
  await expect(page.getByLabel('Wand 1 · oben')).toHaveValue('420');
  await page.getByRole('tab', { name: 'Andere Form' }).click();
  const felder = page.locator('.wandzeile input');
  for (const [i, v] of ['300', '150', '200', '250'].entries()) await felder.nth(i).fill(v);
  await page.getByRole('button', { name: 'Wand', exact: true }).click();
  await page.getByRole('button', { name: 'Wand', exact: true }).click();
  await felder.nth(4).fill('500'); await felder.nth(5).fill('400');
  await expect(page.getByText(/cm offen/)).toBeVisible();
  await page.locator('.wandzeile').nth(1).getByRole('tab', { name: 'dann links' }).click();
  await expect(page.getByText('Raum geht auf')).toBeVisible();
  await page.getByRole('button', { name: 'Möbel stellen' }).click();
  await expect(page.locator('section:has(.buehne) .kopf .titel small')).toHaveText('5,00 × 4,00 m · 17,0 m²');
});
