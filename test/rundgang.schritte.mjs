// Rundgang für die UI-Prüfung (Skill ui-pruefung): so klickt der Kumpel die App durch.
export default async (page, foto) => {
  await foto('start');
  await page.getByText('Raum ausmessen').click();
  await page.waitForTimeout(600);
  await foto('messen-leer');
  await page.getByLabel('Name des Raums').fill('Wohnzimmer');
  await page.getByLabel('Wand 1 · oben').fill('420');
  await page.getByLabel('Wand 2 · rechts').fill('360');
  await page.getByRole('switch', { name: 'Gegenüber nachmessen' }).click();
  await page.getByLabel('Wand 3 · unten').fill('418');
  await page.getByLabel('Wand 4 · links').fill('abc');
  await page.getByRole('button', { name: 'Tür' }).click();
  await foto('messen-tuer');
  await page.getByRole('tab', { name: 'Andere Form' }).click();
  await foto('messen-andere-form');
  await page.getByRole('tab', { name: 'Rechteck' }).click();
  await page.getByRole('button', { name: 'Möbel stellen' }).click();
  await page.waitForTimeout(700);
  await foto('planen');
  await page.getByRole('button', { name: 'Möbel', exact: true }).click();
  await page.waitForTimeout(600);
  await foto('katalog');
  await page.getByText('Sofa schlicht').click();
  await page.waitForTimeout(600);
  const p = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.buehne svg text.g-name')].find(t => t.textContent === 'Sofa schlicht').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p.x, p.y + i * 40);
  await foto('ziehen');
  await page.mouse.up();
  const q = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.buehne svg text.g-name')].find(t => t.textContent === 'Sofa schlicht').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(700);
  await foto('moebel-sheet');
  await page.getByRole('button', { name: 'Schließen' }).click();
  await page.getByRole('tab', { name: '3D' }).click();
  await page.waitForTimeout(1500);
  await foto('3d');
};
