import { test, expect } from '@playwright/test';

test('actual Shift input keeps snapshot and HUD on the V16 recovery phase', async ({ page }) => {
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  await page.click('#prepareBtn');
  await page.click('#startBtn');

  expect(await page.evaluate(() => window.__TROY_RICH_TEST__.input({ type: 'tap', control: 'ShiftLeft' }))).toBe(true);
  const snapshot = await page.evaluate(() => window.__TROY_RICH_TEST__.advanceFixedTicks(33));
  const hud = await page.evaluate(() => ({
    phase: document.querySelector('#parryHud')?.dataset.phase,
    text: document.querySelector('#parryHudText')?.textContent,
  }));

  expect(snapshot.defense).toMatchObject({ source: 'v16', mode: 'parry', action: 'parry', phase: 'recovery' });
  expect(snapshot.defense.cooldownTicks).toBeGreaterThan(0);
  expect(hud).toEqual({ phase: 'recovery', text: '회복' });
});
